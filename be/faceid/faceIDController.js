import { devices } from "../loadEnv.js";
import AccessControlEvent from "../events/accessControlEvent.js";
import { saveEntryLog, saveExitLog, sendAck } from "../sync/sync.js";
import { getPersonByDocument } from "../database/personDatabase.js";
import { getExpiredFields } from "../database/expirations.js";
import requestDigest from "request-digest";
import fs from "fs";
import crypto from "crypto";

//import { JsonDB, Config } from "node-json-db";
//const db = new JsonDB(new Config("./database/database.json", true, false, "/"));

/**
 * Gets the person's data stored in the faceid
 * employeeNo: The id of the person in the face id, in this case the dni is used.
 */

function readImageAsBase64(imagePath) {
  try {

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");
    return base64Image;
  
  } catch (error) {
    console.error("Error reading image: ", error);
    return null;
  }
}

const getUser = async (employeeNo, plate, deviceName, eventType, io, eventDateTime, isPanic) => {
  let username,
    password,
    faceIdIp = "";

    username = devices[deviceName].username;
    password = devices[deviceName].password;
    faceIdIp = devices[deviceName].ip;

  const digestRequest = requestDigest(username, password);
  const host = "http://" + faceIdIp;
  const digestOptions = {
    host,
    path: "/ISAPI/AccessControl/UserInfo/Search?format=json",
    port: 80,
    method: "POST",
    json: true,
    body: {
      UserInfoSearchCond: {
        // Unique per-request search session id. A fixed value here made two
        // near-simultaneous events on the same device share one search
        // session on the device side, which could return the wrong
        // person's name/lote/UF paired with the correct photo.
        searchID: crypto.randomUUID(),
        searchResultPosition: 0,
        maxResults: 30,
        EmployeeNoList: [
          {
            employeeNo: employeeNo,
          },
        ],
      },
    },
    headers: {
      "Content-Type": "application/json",
    },
  };

  try {
    const response = await digestRequest.requestAsync(digestOptions);
    const objUser = JSON.parse(JSON.stringify(response.body));

    const dni = objUser.UserInfoSearch.UserInfo[0].employeeNo;
    const usr_name = objUser.UserInfoSearch.UserInfo[0].name;
    const personInfoExtends = objUser.UserInfoSearch.UserInfo[0].PersonInfoExtends;

    var UF = "";
    var lote = "";
    var category_id = "";
    var id_barrio = "";

    if (personInfoExtends[0].value.includes("|")){
      // PersonInfoExtends":"uf|lote|category_id|id_barrio"

      const arrayPersonInfoExtends = personInfoExtends[0].value.split("|");

      UF = arrayPersonInfoExtends[0].toString();
      lote = arrayPersonInfoExtends[1].toString();
      category_id = arrayPersonInfoExtends[2].toString();
      id_barrio = arrayPersonInfoExtends[3].toString();

    } else {
      // PersonInfoExtends":[{"value":"{"uf":"108", "lote":"105", "category_id":"PROPIETARIO", "bid":"426"}]

      const objPersonInfoExtends = JSON.parse(personInfoExtends[0].value);

      lote = objPersonInfoExtends.lote.toString();
      UF = objPersonInfoExtends.uf.toString();
      category_id = objPersonInfoExtends.category_id.toString();

      // Records written by versions older than multi-barrio support (pre
      // v13) never had a "bid" key here at all. Instead of crashing on
      // that person's log forever, fall back to this device's own
      // ID_BARRIO from the .env file, same as those older versions did.
      id_barrio = (objPersonInfoExtends.bid !== undefined && objPersonInfoExtends.bid !== null)
        ? objPersonInfoExtends.bid.toString()
        : process.env.ID_BARRIO;
    }

    
     
    const objAccessControlEvent = new AccessControlEvent(
      dni,
      usr_name,
      lote,
      UF,
      eventType,
      category_id,
      id_barrio,
      isPanic,
      deviceName,
    );

    // v2: el equipo identifico a la persona, pero la apertura de la puerta
    // ya no la decide el equipo solo (doorRight queda deshabilitado al dar
    // de alta, ver addNewUser) - la decide el backend, validando que los
    // vencimientos documentales de la persona esten vigentes recien antes
    // de mandar la orden de apertura. No bloquea el resto del flujo (foto,
    // log de entrada/salida) si falla.
    validateAndOpenDoor(dni, deviceName, io);

    //return getPicture(dni, objAccessControlEvent, io);
    // eventDateTime must be forwarded here: both getPictureFromFaceID and
    // getPictureFromLocal need it to build the "timestamp" sent to the
    // central API. Without it, the log ends up timestamped with whenever the
    // request reaches the API instead of the real moment the Face ID device
    // fired the event.
    //
    // PHOTO_SOURCE (configurable from the admin panel) decides where the
    // photo shown on screen comes from:
    // - "device" (default): fetched from the Face ID itself on every event.
    // - "local": read straight from ./images, where sync.js already keeps a
    //   copy of every synced person's photo (downloaded from the central
    //   API) - no extra round-trip to the device for the picture.
    // v2: por defecto "local". En v25 el default era "device" (buscar la
    // foto en el propio equipo), pero en v2 nunca se enrola foto/cara en el
    // equipo (alta solo con DNI/nombre/apellido) - dejar "device" como
    // default haria que esto nunca encuentre nada y, en esta base (sin el
    // fix de "siempre mandar log" que se dejo afuera a proposito), el
    // evento ni se loguearia. Si en el futuro se vuelve a enrolar foto,
    // hay que revisar esto de nuevo.
    const photoSource = (process.env.PHOTO_SOURCE || "local").toLowerCase();

    if (photoSource === "local") {
      return getPictureFromLocal(dni, plate, objAccessControlEvent, io, eventDateTime)
    } else {
      return getPictureFromFaceID(dni, plate, digestRequest, objAccessControlEvent, faceIdIp, io, eventDateTime)
    }

  } catch (error) {
    console.log("getUser", error);
  }
};

// --- v2: validar vencimientos documentales antes de abrir la puerta ---
// (la logica de que cuenta como "vencido" vive en ../database/expirations.js,
// compartida con la API que consume el front de la ficha)

// Manda la orden de apertura remota de la puerta del equipo (ISAPI
// RemoteControl/door). doorNo queda fijo en 1 porque los equipos Face ID de
// una sola puerta de esta instalacion no tienen mas de un rele - si en
// algun momento hay un equipo con varias puertas, esto habria que
// parametrizarlo por dispositivo.
const openDoor = async (deviceName) => {
  const device = devices[deviceName];

  if (!device) {
    console.log(`No se pudo abrir la puerta: no existe el dispositivo ${deviceName} en la configuracion.`);
    return false;
  }

  const digestRequest = requestDigest(device.username, device.password);

  const path = "/ISAPI/AccessControl/RemoteControl/door/1?format=json";
  const body = { RemoteControlDoor: { cmd: "open" } };

  const options = {
    host: "http://" + device.ip,
    path,
    port: 80,
    method: "PUT",
    json: false,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };

  const result = await digestRequest.requestAsync(options);

  console.log(`Orden de apertura enviada a ${deviceName}.`);

  return result.body;
};

// Valida contra la base de datos local si la persona tiene todo vigente y,
// solo en ese caso, manda la orden de apertura. Si no hay datos locales de
// esa persona (por ejemplo, una tarjeta de guardia/personal sin ficha de
// residente), por ahora NO se abre la puerta automaticamente - queda
// pendiente de definir si ese tipo de credenciales necesita un bypass
// propio (ver aviso en el chat).
const validateAndOpenDoor = async (dni, deviceName, io) => {
  try {
    const person = getPersonByDocument(dni);

    if (!person) {
      console.log(`Sin datos locales para ${dni}: no se valida ningun vencimiento y no se abre la puerta automaticamente desde el backend.`);
      return;
    }

    const expiredFields = getExpiredFields(person);

    if (expiredFields.length > 0) {
      console.log(`Acceso NO otorgado a ${dni}: vencido/s -> ${expiredFields.join(", ")}.`);
      io.sockets.emit("accessDenied", JSON.stringify({ dni, expiredFields }));
      return;
    }

    await openDoor(deviceName);

  } catch (error) {
    console.log("error validateAndOpenDoor", error);
  }
};

// --- v2: QR code a partir de id_hash (EXPERIMENTAL) ---
//
// No encontre documentacion ISAPI confirmada de como cargar/asociar un QR
// propio (sin pasar por HikCentral) en este modelo de equipo Face ID. Esta
// funcion intenta cargarlo como una "tarjeta" via CardInfo/Record con
// cardType "QRCode" - es la mejor hipotesis que encontre, pero NO esta
// confirmado que el equipo la acepte. Falla en silencio (no corta el alta
// del resto de la persona) para no romper nada si el equipo la rechaza.
// Hay que probarla contra un equipo real y ajustar segun la respuesta.
const addQrCode = async (digestRequest, device, document, idHash) => {
  try {
    const path = "/ISAPI/AccessControl/CardInfo/Record?format=json";

    const body = {
      CardInfo: {
        employeeNo: document,
        cardNo: idHash,
        cardType: "QRCode", // EXPERIMENTAL - no confirmado para este modelo
        addCard: true,
      },
    };

    const options = {
      host: "http://" + device.ip,
      path,
      port: 80,
      method: "POST",
      json: false,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    };

    const result = await digestRequest.requestAsync(options);

    console.log(`QR (EXPERIMENTAL) para ${document}: equipo respondio sin error.`);

    return result.body;

  } catch (error) {
    console.log(`QR (EXPERIMENTAL) para ${document}: el equipo lo rechazo o no lo soporta - no se corta el alta por esto.`, error);
    return false;
  }
};

/**
 * Gets the image of the person stored in the faceid
 * objAccessControlEvent: It is an object of the AccessControlEvent class to complete the value of the image.
 */

/* const getPicture = async (dni, objAccessControlEvent, io) => {
  try {
    const localImage = readImageAsBase64(`./images/${dni}.jpg`);

    // console.log(localImage);

    objAccessControlEvent.setPicture(localImage);

    // Emits the event so that the front end is notified of the event and displays it.
    io.sockets.emit(
      "accessControlEvent",
      JSON.stringify(objAccessControlEvent)
    );

    return objAccessControlEvent;
  } catch (error) {
    console.log("getPicture", error);
  }
}; */

/** 
 * Gets the image of the person stored in the faceid
 * objAccessControlEvent: It is an object of the AccessControlEvent class to complete the value of the image.
*/


const getPictureFromFaceID = async (dni, plate, digestRequest, objAccessControlEvent, faceIdIp, io, eventDateTime) => {

  const host = "http://" + faceIdIp;
  //const dni = objAccessControlEvent.id;

  const digestOptions = {
    host,
    path: "/ISAPI/Intelligent/FDLib/FDSearch?format=json",
    port: 80,
    method: "POST",
    json: true,
    body: {
          "searchResultPosition": 0,
				  "maxResults": 30,
				  "faceLibType": "blackFD",
				  "FDID": "1",
				  "FPID": dni // Id de persona
        },
    headers: {
      "Content-Type": "application/json",
    },
  };

  try {
    const response = await digestRequest.requestAsync(digestOptions);
  
		const obj = JSON.parse(JSON.stringify(response.body));
				
		var status = obj.responseStatusStrg; // OK or  NO MATCH
		
		if (status == "OK"){

			// The url of the image stored in the Face Id is obtained from the answer.

			const faceURL = obj.MatchList[0].faceURL; // format http://192.168.0.104/LOCALS/pic/enrlFace/0/0000000001.jpg@WEB000000000029
			const urlParts = faceURL.split("/");
			const path = urlParts.slice(3).join("/"); // LOCALS/pic/....
		
			// With this url that returns the Face Id we make the call again with the authentication to obtain the image.

      const digestOptionsPic = {
        host,
        path: '/' + path,
        port: 80,
        method: "GET",
        encoding: null 
      };

      try {
			  const responsePic = await digestRequest.requestAsync(digestOptionsPic)
        
        // Ensure the images directory exists
        const imagesDir = './images';
        if (!fs.existsSync(imagesDir)) {
          fs.mkdirSync(imagesDir);
        }

        fs.writeFileSync(`./${imagesDir}/${dni}.jpg`, Buffer.from(responsePic.body, "utf-8"), "binary");
		
        const localImage = readImageAsBase64(`./images/${dni}.jpg`);

        //console.log(localImage);

        objAccessControlEvent.setPicture(localImage);
        
        // Delete the image file after use
        fs.unlinkSync(`./${imagesDir}/${dni}.jpg`);


        // console.log(objAccessControlEvent);

        // Emits the event so that the front end is notified of the event and displays it.
        io.sockets.emit(
          "accessControlEvent",
          JSON.stringify(objAccessControlEvent)
        );
        
        // Send event to AC Central
        
        if (objAccessControlEvent.event_type == "ENTRY") {
          saveEntryLog(objAccessControlEvent.id, objAccessControlEvent.UF, plate, eventDateTime, objAccessControlEvent.id_barrio);
        } else {
          saveExitLog(objAccessControlEvent.id, eventDateTime, objAccessControlEvent.id_barrio);
        }

				// Saves the event in the database
				//db.push("/event[]/entry", objAccessControlEvent);

        return objAccessControlEvent;

			} catch (error) {
        console.log("getPicture error ", error);
      }
			
		}

  } catch (error) {
    console.log("getPicture error ", error);
  }

}


/**
 * Gets the image of the person stored in the disk (populated by sync.js's
 * downloadImage() every time a person is synced from the central API).
 * objAccessControlEvent: It is an object of the AccessControlEvent class to complete the value of the image.
*/

const getPictureFromLocal = async (dni, plate, objAccessControlEvent, io, eventDateTime) => {

  const localImage = readImageAsBase64(`./images/${dni}.jpg`);

  console.log("Getting image from local...");

  //console.log(localImage);

  objAccessControlEvent.setPicture(localImage);

  // console.log(objAccessControlEvent);

  // Emits the event so that the front end is notified of the event and displays it.
  io.sockets.emit(
    "accessControlEvent",
    JSON.stringify(objAccessControlEvent)
  );

  // Send event to AC Central

  if (objAccessControlEvent.event_type == "ENTRY") {
    saveEntryLog(objAccessControlEvent.id, objAccessControlEvent.UF, plate, eventDateTime, objAccessControlEvent.id_barrio);
  } else {
    saveExitLog(objAccessControlEvent.id, eventDateTime, objAccessControlEvent.id_barrio);
  }

    // Saves the event in the database
    //db.push("/event[]/entry", objAccessControlEvent);

    return objAccessControlEvent;

}

const callDigest = async (device, userInfo, onlyDelete=false) => {
  try {
    const digestRequest = requestDigest(device.username, device.password);

    const document = userInfo.document;

    // v2: no se enrola foto/cara en el equipo (alta solo con DNI, nombre y
    // apellido), asi que no hace falta limpiar ninguna foto previa antes de
    // dar de baja al usuario - se elimina directamente el paso
    // deletePicture, que en access-control-local (v25) era justo el que
    // podia fallar y frenar todo el alta/baja cuando el equipo estaba
    // realmente offline.
    const result2 = await deleteUser(digestRequest,device,document);

    if (!onlyDelete) {
      const result3 = await addNewUser(digestRequest, device, userInfo);

      if (result3) {

        await addCard(digestRequest, device, userInfo);

        // Si la persona tiene id_hash, se intenta cargar como QR
        // (experimental - ver aviso en addQrCode). No corta el alta si
        // falla.
        if (userInfo.id_hash) {
          await addQrCode(digestRequest, device, document, userInfo.id_hash);
        }
      }
    }

    return true;

  } catch (error) {

    console.log("error callDigest", error);
	  return false;
  }
};

/**
 * User info.
 * @typedef {Object} UserInfo
 * @property {string} document - individual document number.
 * @property {string} name - Indvidual name and lastname.
 * @property {string} beginTime - Data and time form individual is enabled. Format YYYY-MM-DDTHH:MM_SS.
 * @property {string} endTime - Data and time to individual is enabled. Format YYYY-MM-DDTHH:MM_SS.
 * @property {string} uf - Indvidual uf.
 * @property {string} lote - Indiviual lote.
 * @property {string} picture_url - Individual Pucture url.
 */

/**
 * Procecess a User (Delete if existe, add user, delete picture if exist and add picture).
 * @param  {UserInfo} userInfo - {@link UserInfo} object
 * @return {void}
 */

const processUser = async (userInfo, onlyDelete) => {

  for (let key in devices) {

    const device = devices[key];

    const result = await callDigest(device, userInfo, onlyDelete);

    if (result) {
  
      const gate = devices[key].name
      sendAck(userInfo.id_auth, gate);
 
    } else {
      return false;
    }

  }

  return true;
};

const deleteUser = async (digestRequest, device, document) => {
    try {
        const path = "/ISAPI/AccessControl/UserInfo/Delete?format=json";
  
        const body = {
          UserInfoDelCond: {
            EmployeeNoList: [{ employeeNo: document }],
          },
        };
  
        const options = {
            host: "http://" + device.ip,
            path: path,
            port: 80,
            method: "PUT",
            json: false,
            body: JSON.stringify(body),
            headers: {
            	"Content-Type": "application/json",
            },
        };
      
        const result = await digestRequest.requestAsync(options);

        //console.log("result image deleteUSer", result);
        console.log(`User ${document} deleted successfully.`);

		return result.body;

    } catch (error) {
        console.log("error deleteUser", error);
    }
};

const addNewUser = async (digestRequest, device, userInfo) => {
    try {
        const path = "/ISAPI/AccessControl/UserInfo/Record?format=json";

        const propertyValue = userInfo.uf + "|" + userInfo.lote + "|" + userInfo.category_id + "|" + userInfo.id_barrio;

        const body = {
          UserInfo: {
            "employeeNo":userInfo.document,
            "deleteUser":null,
            "name":userInfo.fullname,
            "userType":"normal",
            "closeDelayEnabled":false,
            "Valid":{
              "enable":true,
              "beginTime":userInfo.beginTime,
              "endTime":userInfo.endTime,
              "timeType": "local",
            },
            "gender": "male",
            "localUIRight":false,
            "maxOpenDoorTime":0,
            // v2: doorRight en "0" y sin RightPlan - la idea es que el equipo
            // IDENTIFIQUE a la persona (y mande el evento) pero NO abra la
            // puerta por si solo; la apertura la manda el backend via
            // RemoteControl/door, solo si los vencimientos documentales
            // estan vigentes (ver validateAndOpenDoor). OJO: no pude
            // confirmar en la documentacion que el equipo siga generando el
            // evento de identificacion con doorRight deshabilitado - hay que
            // probarlo contra un equipo real. Si el equipo NO llega a
            // generar el evento asi, hay que volver a "1" y resolver el
            // bloqueo de otra forma (por ejemplo, desconectando el rele de
            // la cerradura del equipo y que la abra solo el backend por otro
            // medio).
            "doorRight":"0",
            "userVerifyMode":"",
            "PersonInfoExtends": [
              {
                "name": "properties",
                "value": propertyValue,
              },
            ],
          },
        };

        const options = {
            host: "http://" + device.ip,
            path: path,
            port: 80,
            method: "POST",
            json: false,
            body: JSON.stringify(body),
            headers: {
            "Content-Type": "application/json",
            },
        };

        const result = await digestRequest.requestAsync(options);

        //console.log("result image addNewUser", result);
        console.log(`User ${userInfo.document}: added successfully.`);

        return true;

		    //return result.body;

    } catch (error) {
        console.log("error addNewUser", error);
        return false;
    }
};

const addCard = async (digestRequest, device, userInfo) => {
  try {

    if (userInfo.panic_card_number != null && userInfo.panic_card_number != "") {
      
      const path = "/ISAPI/AccessControl/CardInfo/Record?format=json";

      const body = {
          "CardInfo":{
          "employeeNo":userInfo.document,
          "cardNo":userInfo.panic_card_number,
          "cardType":"hijackCard",
          "addCard": true
        }
      };

      const options = {
          host: "http://" + device.ip,
          path: path,
          port: 80,
          method: "POST",
          json: false,
          body: JSON.stringify(body),
          headers: {
          "Content-Type": "application/json",
          },
      };

      const result = await digestRequest.requestAsync(options);

      //console.log("result image addNewUser", result);
      console.log(`Card ${userInfo.panic_card_number}: added successfully.`);
    
    }

    return true;

    //return result.body;

  } catch (error) {
      console.log("error addCard", error);
      return false;
  }
};

// Nota v2: deletePicture y addNewPicture (enrolar foto/cara en el equipo)
// se sacaron de este archivo - en v2 el alta es solo DNI/nombre/apellido,
// sin foto, asi que no hacen falta. Si en algun momento se quiere agregar
// enrolamiento facial de vuelta, estan en el historial de access-control-local (v25).

export { getUser, processUser };
