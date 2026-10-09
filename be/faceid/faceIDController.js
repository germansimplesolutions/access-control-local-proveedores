import { devices } from "../loadEnv.js";
import AccessControlEvent from "../events/accessControlEvent.js";
import { saveEntryLog, saveExitLog, sendAck } from "../sync/sync.js";
import { getPersonByDocument } from "../database/personDatabase.js";
import { getExpiredFields, getAuthorizationsList } from "../database/expirations.js";
import { getTakerConfig, checkCobertura, registerAcceso } from "../taker/takerClient.js";
import requestDigest from "request-digest";
import fs from "fs";

// Con Taker activo, ART y Certificado de reincidencia dejan de validarse
// contra las fechas locales - los reemplaza la consulta en vivo a
// /cobertura (ver taker/takerClient.js). El resto (registro de conducir,
// seguro del vehículo, autorización de ingreso) sigue igual que siempre.
// Mismo array usado en databaseRoutes.js para la ficha, para que los dos
// lados coincidan.
const TAKER_EXCLUDED_KEYS = ["art_date", "cert_penalty_date"];

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

const getUser = async (employeeNo, plate, deviceName, eventType, io, eventDateTime, isPanic, shouldLog = true) => {
  let username,
    password,
    faceIdIp = "";

    username = devices[deviceName].username;
    password = devices[deviceName].password;
    faceIdIp = devices[deviceName].ip;

  // digestRequest sigue haciendo falta aca: getPictureFromFaceID (cuando
  // PHOTO_SOURCE=device) lo usa para buscar la foto enrolada en el equipo
  // (FDSearch, por FPID/documento) - eso no tiene nada que ver con
  // PersonInfoExtends.
  const digestRequest = requestDigest(username, password);

  try {
    const dni = employeeNo;

    // v2: antes esto le preguntaba al propio equipo (UserInfo/Search) el
    // nombre y un campo "PersonInfoExtends" grabado en el alta (ver
    // addNewUser) con lote/UF/categoria/id_barrio. Con una sola
    // autorizacion por persona nunca daba problema, pero con mas de una
    // (distintos lotes) cada sincronizacion pisaba ese campo con la
    // ULTIMA autorizacion procesada, sin ningun criterio - el log de
    // entrada/salida terminaba atribuido a cualquier lote, no
    // necesariamente al correcto. Ahora se usa directo la base local
    // (personDatabase.js), que ya tiene las autorizaciones completas de
    // la persona, y el equipo deja de necesitar guardar nada de esto.
    const person = getPersonByDocument(dni);

    if (!person) {
      console.log(`Persona ${dni} identificada por el equipo pero sin datos locales (no sincronizada todavia) - no se muestra ficha ni se loguea.`);
      return;
    }

    const individual = person.individual || {};
    const usr_name = [individual.name, individual.lastname].filter(Boolean).join(" ");

    // id_barrio es un dato de la persona (no cambia segun la autorizacion).
    // Registros viejos (pre multi-barrio) pueden no tenerlo - mismo
    // fallback al ID_BARRIO de este docker que se usaba antes.
    const id_barrio = individual.id_barrio
      ? individual.id_barrio.toString()
      : process.env.ID_BARRIO;

    // Autorizaciones vigentes (no vencidas) de esta persona - puede haber
    // mas de una (distintos lotes). Se loguea una entrada por cada una
    // (ver logAccessForAuthorizations, usado desde getPictureFromLocal/
    // FaceID) - aca solo se usa la primera para los datos "de exhibicion"
    // del evento que viaja por el socket a la pantalla de la ficha.
    const validAuthorizations = getAuthorizationsList(person).filter((auth) => !auth.expired);
    const primaryAuth = validAuthorizations[0];

    const lote = primaryAuth ? primaryAuth.uf.toString() : "";
    const UF = lote;
    const category_id = primaryAuth ? primaryAuth.category : (individual.category_id || "");

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

    // v2: la apertura de la puerta YA NO se decide aca ni con
    // RemoteControl/door - se decide respondiendo al remoteCheck del
    // propio equipo (Remote Verification, ver respondToRemoteCheck mas
    // abajo y su uso en events.js), validando ahi mismo los vencimientos
    // documentales. Esto (identificar a la persona para mostrarla en
    // pantalla/mandar el log) sigue de largo sin depender de esa decision.

    //return getPicture(dni, objAccessControlEvent, io);
    // eventDateTime must be forwarded here: both getPictureFromFaceID and
    // getPictureFromLocal need it to build the "timestamp" sent to the
    // central API. Without it, the log ends up timestamped with whenever the
    // request reaches the API instead of the real moment the Face ID device
    // fired the event.
    //
    // PHOTO_SOURCE (configurable from el panel admin) decide de donde sale
    // la foto que se muestra en pantalla:
    // - "device": se busca en el propio equipo Face ID en cada evento.
    // - "local" (default): se lee directo de ./images, donde sync.js ya
    //   guarda una copia de la foto de cada persona sincronizada (bajada de
    //   la API central) - evita un viaje extra al equipo solo para mostrar
    //   la foto. La CARA enrolada en el equipo (para que te reconozca) es un
    //   tema aparte, ver addNewPicture en callDigest.
    const photoSource = (process.env.PHOTO_SOURCE || "local").toLowerCase();

    if (photoSource === "local") {
      return getPictureFromLocal(dni, plate, objAccessControlEvent, io, eventDateTime, shouldLog, validAuthorizations)
    } else {
      return getPictureFromFaceID(dni, plate, digestRequest, objAccessControlEvent, faceIdIp, io, eventDateTime, shouldLog, validAuthorizations)
    }

  } catch (error) {
    console.log("getUser", error);
  }
};

// --- v2: validar vencimientos documentales antes de abrir la puerta ---
// (la logica de que cuenta como "vencido" vive en ../database/expirations.js,
// compartida con la API que consume el front de la ficha)
//
// La apertura real la decide el equipo mismo via su funcion "Remote
// Verification": identifica a la persona, nos manda el evento con
// remoteCheck:true y espera que le contestemos (dentro de un timeout
// configurado en el equipo) si abre o no. sendRemoteCheck es esa
// respuesta. Reemplaza al viejo mecanismo de forzar la apertura con
// RemoteControl/door - tener los dos mecanismos activos a la vez hace que
// compitan y den resultados inconsistentes (probado en campo: con
// RemoteControl/door denegando por vencimientos Y remoteCheck contestando
// "success" en paralelo, el equipo terminaba abriendo igual).
//
// Requiere en el equipo (configuracion manual, pantalla propia del
// equipo, Access Control > Parameter Settings > Terminal Parameters):
// Remote Verification = ON, Verifying Person Type Remotely = Normal User
// (+ Visitor/Unadded Person), Result Return Mode = Asynchronous, y que el
// RightPlan de la persona tenga una plantilla horaria valida (ver
// addNewUser - antes se usaba una plantilla vacia a proposito para
// bloquear localmente, ya no hace falta).
const sendRemoteCheck = async (deviceName, serialNo, checkResult, info) => {
  const device = devices[deviceName];

  if (!device) {
    console.log(`No se pudo responder remoteCheck: no existe el dispositivo ${deviceName} en la configuracion.`);
    return;
  }

  try {
    const digestRequest = requestDigest(device.username, device.password);

    const path = "/ISAPI/AccessControl/remoteCheck?format=json";
    const body = {
      RemoteCheck: {
        serialNo,
        checkResult, // "success" o "failed"
        info: (info || "").slice(0, 64), // el equipo acepta hasta 64 caracteres
      },
    };

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

    console.log(`remoteCheck serialNo=${serialNo} (${deviceName}) -> ${checkResult}.`);

    return result.body;

  } catch (error) {
    console.log("error sendRemoteCheck", error);
  }
};

// Valida contra la base de datos local si la persona tiene todo vigente y
// contesta el remoteCheck en consecuencia. Si no hay datos locales de esa
// persona (por ejemplo, una tarjeta de guardia/personal sin ficha de
// residente), por ahora se contesta "failed" (comportamiento conservador
// heredado del mecanismo anterior) - queda pendiente de definir si ese
// tipo de credenciales necesita un bypass propio.
const respondToRemoteCheck = async (dni, deviceName, serialNo, io) => {
  try {
    const person = getPersonByDocument(dni);

    if (!person) {
      console.log(`Sin datos locales para ${dni}: no se valida ningun vencimiento, se responde "failed" (comportamiento conservador, ver aviso pendiente).`);
      await sendRemoteCheck(deviceName, serialNo, "failed", "Sin ficha local");
      return;
    }

    const takerConfig = getTakerConfig();

    // Con Taker activo se consulta su cobertura en vez de validar ART/
    // reincidencia localmente (ver TAKER_EXCLUDED_KEYS arriba) - si Taker
    // no confirma cobertura (error puntual de la persona, o Taker caído/sin
    // responder), se bloquea el acceso igual (fail closed, decisión
    // explícita del usuario) y se muestra el motivo correspondiente.
    const takerResult = takerConfig.enabled ? await checkCobertura(dni) : null;
    const excludeKeys = takerConfig.enabled ? TAKER_EXCLUDED_KEYS : [];

    const expiredFields = getExpiredFields(person, { excludeKeys });

    if (takerResult && !takerResult.ok) {
      expiredFields.unshift(takerResult.message);
    }

    if (expiredFields.length > 0) {
      const info = expiredFields.join(", ");
      console.log(`Acceso NO otorgado a ${dni}: vencido/s -> ${info}.`);
      io.sockets.emit("accessDenied", JSON.stringify({ dni, expiredFields }));
      await sendRemoteCheck(deviceName, serialNo, "failed", info);
      return;
    }

    await sendRemoteCheck(deviceName, serialNo, "success", "OK");

  } catch (error) {
    console.log("error respondToRemoteCheck", error);
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

// v2: loguea un ingreso/egreso en la plataforma central. Para ENTRY se
// loguea UNA VEZ POR CADA autorizacion vigente de la persona (si tiene
// varios lotes autorizados, se generan varios registros de ingreso - ver
// decision tomada con el usuario) - si no tiene ninguna vigente en la
// base local (caso raro con shouldLog=true, por ejemplo una tarjeta sin
// ficha completa) se loguea una vez igual con el UF que haya quedado en
// el evento, para no perder el registro por completo. Para EXIT se
// loguea una sola vez sin importar cuantas autorizaciones tenga: el
// endpoint de salida (saveExitLog) no tiene nocion de "uf" en absoluto,
// asi que repetirlo por cada autorizacion solo mandaria el mismo exit
// duplicado N veces.
const logAccessForAuthorizations = (objAccessControlEvent, plate, eventDateTime, validAuthorizations) => {
  if (objAccessControlEvent.event_type == "ENTRY") {
    const authsToLog = (validAuthorizations && validAuthorizations.length > 0)
      ? validAuthorizations
      : [{ uf: objAccessControlEvent.UF }];

    for (const auth of authsToLog) {
      saveEntryLog(objAccessControlEvent.id, auth.uf, plate, eventDateTime, objAccessControlEvent.id_barrio);
    }
  } else {
    saveExitLog(objAccessControlEvent.id, eventDateTime, objAccessControlEvent.id_barrio);
  }

  // Taker: una sola notificacion a /acceso por evento real (nunca una por
  // cada autorizacion/lote de la persona, a diferencia del loop de
  // saveEntryLog de arriba) - Taker decide el mismo si es entrada o salida
  // segun el ultimo estado que tenga de esa persona. No se espera (await)
  // esto: ya se decidio si se abria o no la puerta (ver
  // respondToRemoteCheck), esto es solo un efecto secundario que no puede
  // demorar ni afectar el resto del flujo.
  if (getTakerConfig().enabled) {
    registerAcceso(objAccessControlEvent.id);
  }
};

/** 
 * Gets the image of the person stored in the faceid
 * objAccessControlEvent: It is an object of the AccessControlEvent class to complete the value of the image.
*/


const getPictureFromFaceID = async (dni, plate, digestRequest, objAccessControlEvent, faceIdIp, io, eventDateTime, shouldLog = true, validAuthorizations = []) => {

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
        
        // Send event to AC Central - solo si corresponde loguear este
        // evento (ver shouldLog en events.js: el equipo manda un evento
        // separado con remoteCheckResult "failed" cuando no se abrio, y ahi
        // no hay que loguear un ingreso/egreso que no ocurrio).

        if (shouldLog) {
          logAccessForAuthorizations(objAccessControlEvent, plate, eventDateTime, validAuthorizations);
        }

				// Saves the event in the database
				//db.push("/event[]/entry", objAccessControlEvent);

        return objAccessControlEvent;

			} catch (error) {
        console.log("getPicture error ", error);
      }
			
		} else {
      // Sin foto/cara enrolada en el equipo (por ejemplo, persona
      // sincronizada sin foto con SYNC_WITH_PICTURE=0) - antes esto no
      // hacia nada mas: no se mostraba la ficha en pantalla ni se mandaba
      // el log de entrada/salida para esta persona. Ahora se muestra/loguea
      // igual, sin foto (el cuadro de iniciales queda como respaldo en el
      // front, ver FichaCard.jsx).
      console.log(`Persona ${dni}: sin foto/cara en el equipo (${status}), se muestra/loguea igual sin foto.`);

      io.sockets.emit(
        "accessControlEvent",
        JSON.stringify(objAccessControlEvent)
      );

      if (shouldLog) {
        logAccessForAuthorizations(objAccessControlEvent, plate, eventDateTime, validAuthorizations);
      }

      return objAccessControlEvent;
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

const getPictureFromLocal = async (dni, plate, objAccessControlEvent, io, eventDateTime, shouldLog = true, validAuthorizations = []) => {

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

  // Send event to AC Central - solo si corresponde loguear este evento (ver
  // shouldLog en events.js: el equipo manda un evento separado con
  // remoteCheckResult "failed" cuando no se abrio, y ahi no hay que loguear
  // un ingreso/egreso que no ocurrio).

  if (shouldLog) {
    logAccessForAuthorizations(objAccessControlEvent, plate, eventDateTime, validAuthorizations);
  }

    // Saves the event in the database
    //db.push("/event[]/entry", objAccessControlEvent);

    return objAccessControlEvent;

}

const callDigest = async (device, userInfo, onlyDelete=false) => {
  try {
    const digestRequest = requestDigest(device.username, device.password);

    const document = userInfo.document;

    // Es "Face ID": la cara SI se enrola en el equipo (igual que en v25),
    // para que te reconozca de verdad. Lo que v2 cambia es que el alta
    // ademas guarda la ficha completa en la base local y, si hay id_hash,
    // intenta cargar un QR (ver addQrCode). Mantiene el mismo
    // comportamiento base de v25 (sin los 2 fixes de offline/log que se
    // dejaron afuera a proposito): si el equipo esta realmente offline,
    // deletePicture tira timeout y se corta todo el alta/baja.
    const result1 = await deletePicture(digestRequest, device, document);

    if (result1 === undefined) { // Timeout, el equipo esta offline
      throw new Error(`Device ${device.name} is off-line`);
    }

    const result2 = await deleteUser(digestRequest,device,document);

    if (!onlyDelete) {
      const result3 = await addNewUser(digestRequest, device, userInfo);

      if (result3) {

        const result4 = await addCard(digestRequest, device, userInfo);

        if (result4) {
          // userInfo.image_url puede venir null si sync.js trajo a esta
          // persona sin foto todavia (SYNC_WITH_PICTURE=0) - en ese caso no
          // se intenta enrolar cara, la persona queda cargada igual
          // (usuario + tarjeta, si tiene) para que pueda identificarse por
          // otro medio sin que esto rompa.
          const hasPicture = Boolean(userInfo.image_url);
          if (hasPicture) {
            await addNewPicture(digestRequest, device, document, userInfo.image_url);
          } else {
            console.log(`User ${document}: sin foto, se da de alta sin enrolar cara (solo tarjeta/DNI).`);
          }
        }

        // Si la persona tiene id_hash, se intenta cargar ADEMAS como QR
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

        // v2: antes aca se grababa "PersonInfoExtends" con
        // uf|lote|category_id|id_barrio, y getUser() se lo volvia a leer
        // al equipo para armar el log de entrada/salida. Con mas de una
        // autorizacion por persona ese campo (uno solo por usuario en el
        // equipo) terminaba con el valor de la ULTIMA autorizacion
        // sincronizada, sin ningun criterio. Ahora ese dato se saca
        // directo de la base local (ver getUser), asi que el equipo ya no
        // necesita guardar nada de esto.
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
            // doorRight tiene que ser un numero de puerta real (probado
            // contra el equipo: "0" lo rechaza con error "exceeding the
            // parameter range limit... doorRight" - no es un on/off).
            // La plantilla horaria tiene que ser una VALIDA (24hs) - la
            // apertura ya no se bloquea con una plantilla vacia, se decide
            // contestando el remoteCheck del equipo (ver sendRemoteCheck/
            // respondToRemoteCheck). Si esta plantilla queda sin horario
            // cargado, el equipo deniega por horario ANTES de llegar a
            // preguntarnos nada, pisando lo que contestemos en remoteCheck
            // (probado en campo).
            "doorRight":"1",
            "RightPlan":[{"doorNo":1,"planTemplateNo":"1"}],
            "userVerifyMode":"",
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

// Borra la cara anterior del equipo antes de dar de baja al usuario (igual
// que en v25). Si el equipo esta offline, esta llamada es la que tira
// timeout y corta todo el alta/baja (ver callDigest).
const deletePicture = async (digestRequest, device, document) => {
    try {
        const path = "/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=1&faceLibType=blackFD";

        const body = {
                        "FPID":[
                            {"value": document}
                        ]
                    };
        var b = JSON.stringify(body);

        const options = {
            host: "http://" + device.ip,
            path: path,
            port: 80,
            method: "PUT",
            json: false,
            body: b,
            headers: {
            "Content-Type": "application/json",
            },
        };

        const result = await digestRequest.requestAsync(options);

        console.log(`User ${document}: image deleted successfully.`);

		return result.body;

    } catch (error) {
        console.log("error deletePicture", error);
    }
};

// Enrola la cara de la persona en el equipo, a partir de la URL de la foto
// (el equipo mismo baja la imagen de esa URL - tiene que poder llegar a
// internet para esto, igual que en v25).
const addNewPicture = async (digestRequest, device, document, url_file) => {
    try {
        const path = "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json";

        const body = {
            faceLibType: "blackFD",
            FDID: "1",
            FPID: document,
            faceURL: url_file,
        };

        const json_body = JSON.stringify(body);

        const options = {
            host: "http://" + device.ip,
            path: path,
            port: 80,
            method: "POST",
            json: false,
            body: json_body,
            headers: {
            "Content-Type": "application/json",
            },
        };

        const result = await digestRequest.requestAsync(options);

        console.log(`User ${document}: image added successfully.`);

		return result.body;

    } catch (error) {
        console.log("error addNewPicture", error.body);
    }
};

export { getUser, processUser, respondToRemoteCheck };
