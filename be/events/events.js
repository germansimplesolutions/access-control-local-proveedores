import { devices, subEventTypes} from "../loadEnv.js";
import { Router } from "express";
//import { IncomingForm } from "formidable";
import { getUser, processUser, respondToRemoteCheck } from "../faceid/faceIDController.js";
import { downloadImage, sleep } from "../utils/utils.js";
import fs from "fs";
import multer  from "multer";
import axios from "axios";

const multiform = multer({ dest: 'uploads/' })

const router = new Router();

// --- Per-device serialization ---
// Two events arriving almost at the same time for the SAME physical device
// (two people badging in back to back, or a double-read) used to trigger two
// concurrent getUser() calls against that same Hikvision device. That could
// end up mixing up which person's data came back from which request. This
// queues tasks per deviceName so a device's events are always resolved one
// at a time, in order, while different devices keep running fully in
// parallel exactly as before (no change for single-device setups' overall
// throughput, since each device already only fires one event at a time in
// practice).
const deviceQueues = new Map();

function runExclusiveForDevice(deviceName, task) {
  const previous = deviceQueues.get(deviceName) || Promise.resolve();
  const settledPrevious = previous.catch(() => {}); // one failure must never jam the queue
  const current = settledPrevious.then(task);
  deviceQueues.set(deviceName, current.catch(() => {}));
  return current;
}

const routes = (io) => {
  //THIS IS JUST A SAMPLE ENDPOINT TO AVOID USING POSTMAN
  router.get("/event", async (req, res) => {
    //await db.push("/test1", Math.random());
    await db.push("/test2/my/test", 5);

    io.sockets.emit("test", { test: true });
    res.json({
      test: true,
    });
  });

  router.get("/events", async (req, res) => {
    //TODO: SIMPLESOLUTIONS SERVER IS GONNA CALL IT AND SYNC WITH MYSQL DATABASE
    //DELETE LOGS
  });

  //THIS IS CALLED FROM SIMPLESOLUTIONS SERVER
  //POST http://198.121.123.113:3333/auth
  //API-KEY
  router.post("/auth", async (req, res) => {
    if (req.method === "POST") {
      // Handle post info...
      const fields = req.body;

      const userInfo = {
        document: fields.document.toString(),
        fullname: fields.name + " " + fields.lastname,
        beginTime: fields.date_from + "T" + fields.hour_from,
        endTime: fields.date_to + "T" + fields.hour_to,
        uf: fields.uf.toString(),
        lote: fields.lote.toString(),
        eventType: fields.event_type.toString(),
        image_url: fields.image_url.toString(),
      };

      downloadImage(userInfo.image_url, `./images/${userInfo.document}.jpg`);

      const response = await processUser(userInfo);

      if (response) {
        
        res.statusCode = 200;
        res.json({
          status: true,
        });

      } else {

        res.statusCode = 400;
        res.json({
          status: false,
        });

      }
    }
  });

  //THIS IS CALLED FROM THE FACE ID
  //POST http://198.xxx.xxx.xxx:3888/event

  router.post("/event", multiform.single('Picture'), async (req, res) => {

    try {

      if (req.method === "POST") {
        // Handle post info...
        
        if (req.body.event_log !== undefined) {
          console.log(req.body.event_log);
        } else {
          console.log(req.body.AccessControllerEvent);
        }

        // const formData = new IncomingForm({});
        let dni;
        let plate;
        let eventType;
        let deviceName;

        let eventDateTime;
        let eventDateTimeTemp;
        let eventDate;
        let eventTime

        var obj = null;

        if (req.body.event_log !== undefined) {
          obj = JSON.parse(req.body.event_log);
        } else if (req.body.AccessControllerEvent !== undefined) {
          obj = JSON.parse(req.body.AccessControllerEvent);
        }

        var subEventType = -1;
        var cardType = -1;

        if (obj.AccessControllerEvent !== undefined ) {
          subEventType = (obj.AccessControllerEvent.subEventType) ? obj.AccessControllerEvent.subEventType : -1;
          cardType = (obj.AccessControllerEvent.cardType) ? obj.AccessControllerEvent.cardType : -1;
        }

        dni = 0;
        plate = "";

        // v2: Remote Verification del equipo (ver aviso completo en
        // sendRemoteCheck/respondToRemoteCheck, faceIDController.js). Esto
        // corre SIEMPRE que el equipo marque remoteCheck:true,
        // independientemente del filtro de subEventType/cardType de mas
        // abajo (ese filtro es solo para decidir que se muestra/loguea,
        // no para decidir si se abre la puerta). No se espera (await) aca
        // para no demorar la respuesta "ok" del webhook - el equipo tiene
        // su propio timeout corriendo en paralelo mientras tanto.
        if (obj.AccessControllerEvent !== undefined && obj.AccessControllerEvent.remoteCheck === true) {
          const rcDni = obj.AccessControllerEvent.employeeNoString;
          const rcDeviceName = obj.AccessControllerEvent.deviceName;
          const rcSerialNo = obj.AccessControllerEvent.serialNo;

          respondToRemoteCheck(rcDni, rcDeviceName, rcSerialNo, io);
        }

        res.end("ok");

        // Eliminar el archivo temporal que subió multer (si vino una foto
        // adjunta al evento). Antes esto se hacía más abajo, solo cuando el
        // subEventType/cardType del evento estaba entre los tipos de evento
        // habilitados - si el equipo mandaba un evento de un tipo no
        // habilitado, el archivo se guardaba en uploads/ y nunca se
        // borraba, quedando acumulado ahí. Ahora se borra siempre que haya
        // llegado un archivo, se procese o no el evento.
        if (req.file != undefined) {
          if (req.file.destination !== undefined && req.file.filename !== undefined) {

            var old_name = req.file.destination + req.file.filename;
            // var new_name = req.file.destination + dni + ".jpeg";

            // fs.rename(old_name, new_name, (err) => {
            //   if (err) throw err;
            //   console.log('Rename complete!');
            // });

            if (old_name != "") {
              fs.unlink(old_name, (err) => {
                if (err) console.log("Error deleting file recived: " + err);
                console.log(old_name+ ' was deleted');
              });
            }
          }
        }

        const subEvent = getSubEvent(subEventType, cardType);

        // v2: el equipo manda DOS eventos HTTP distintos para una misma
        // identificacion cuando Remote Verification esta activo - uno con
        // remoteCheck:true (la pregunta "abro o no?", ya respondida arriba)
        // y, instantes despues, uno con remoteCheckResult (la confirmacion
        // de que paso). Los dos traen el mismo subEventType/cardType, asi
        // que sin este corte se mostraba la ficha en pantalla y se mandaba
        // el log de entrada/salida DOS VECES por cada acceso. El evento
        // remoteCheck:true no hace nada mas aca - ya se contesto arriba.
        if (obj.AccessControllerEvent !== undefined && obj.AccessControllerEvent.remoteCheck === true) {
          return;
        }

        if (subEvent.length > 0) {

          eventDateTimeTemp = obj.dateTime;  //"2024-12-15T21:54:45-03:00"
          eventDateTimeTemp = eventDateTimeTemp.split("T");
          eventDate = eventDateTimeTemp[0];
          eventTime = eventDateTimeTemp[1].split("-")[0];

          eventDateTime = eventDate + " " + eventTime;

          deviceName = obj.AccessControllerEvent.deviceName; // Acording to deviceName the type of event is defined
          eventType = devices[deviceName].type; // Get device type ENTRY or EXIT
          dni = obj.AccessControllerEvent.employeeNoString;

          // Get plate from camera

          if (devices[deviceName].use_alpr == 1) {

            var elapsedTimeInSeconds = calculateDifferenceInSeconds(eventDateTime);
            if (elapsedTimeInSeconds <= devices[deviceName].time_elapsed_since_auth){ 

              try {
                console.log("Getting plate...");
                
                await sleep(devices[deviceName].waiting_time);

                plate = await getLicenseImage(devices[deviceName].rtsp_url);

                if (plate == undefined)
                  plate = "";

                console.log("Plate getted " + plate);

              } catch (error) {
                console.error("Error getting plate", error);
                plate = "";
              }

            }
          }

          // Si este evento trae remoteCheckResult (viene de un equipo con
          // Remote Verification activo), el log de entrada/salida a la
          // plataforma central se manda solo si el resultado fue "success" -
          // si fue "failed" no hubo ingreso real y no corresponde loguearlo.
          // Si no trae remoteCheckResult (equipo sin Remote Verification
          // configurado), se mantiene el comportamiento de siempre: se
          // loguea igual.
          const remoteCheckResult = obj.AccessControllerEvent.remoteCheckResult;
          const shouldLog = remoteCheckResult === undefined || remoteCheckResult === "success";

          await runExclusiveForDevice(deviceName, () =>
            getUser(dni, plate, deviceName, eventType, io, eventDateTime, subEvent[0].isPanic, shouldLog)
          );

          
        }

        // res.end("ok");

      }
    
    } catch (error) {
      console.error("Error reciving event", error);
      return false;
    }

  });

  router.post("/test", async (req, res) => {
    const result = await getUser(req.body.dni, "ENTRY", io);

    res.send(result);
  });

  return router;
};

//WE DON'T NEED TO USE THIS RIGHT NOW, JUST AN EXAMPLE
const socketEvent = (io, socket) => {
  socket.on("test", () => {
    console.log("someone sends a test to the server");
  });
};

export { routes, socketEvent};

function getSubEvent(subEventType, cardType) {

  var subEvent = subEventTypes.filter(function(item) {
    return item.subEventType == subEventType && item.cardType == cardType;
  });

  return subEvent;

}
  
const getLicenseImage = async (rtspUrl)  => {
  try {
    const url = 'http://lpr:5000/get_license_image';

    const data = {
      rtsp_url: rtspUrl
    };

    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('LPR service response:', response.data);

    var license_plate = "";
    if (response.data.length > 0) {
      license_plate = response.data[0].license_plate;
    }

    return license_plate.replace("_", "");

  } catch (error) {
    console.error('Error calling lpr service:', error.message);
    if (error.response) {
      console.error('Error data:', error.response.data);
    }
    return license_plate;
  }
}

function calculateDifferenceInSeconds(stringDateTime) {
  // Convertir la cadena a un objeto Date
  const fechaIngresada = new Date(stringDateTime.replace(" ", "T")); // Reemplazar espacio por 'T'
  
  // Validar si la conversión fue exitosa
  if (isNaN(fechaIngresada)) {
    throw new Error("La fecha proporcionada no es válida.");
  }

  // Obtener la fecha actual
  const fechaActual = new Date();
  console.log("Fecha y hora actual: " + fechaActual);
  console.log("Fecha y hora del evento: " + fechaIngresada);

  // Calcular la diferencia en milisegundos
  const diferenciaMilisegundos = fechaActual - fechaIngresada;

  // Convertir la diferencia a segundos
  const diferenciaSegundos = Math.floor(diferenciaMilisegundos / 1000);
  
  console.log("Diferencia en segundos entre Fecha y hora del evento y la fecha y hora actual: " + diferenciaSegundos);

  return diferenciaSegundos;
}
