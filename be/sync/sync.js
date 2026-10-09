import { gates } from "../loadEnv.js";
import {processUser } from "../faceid/faceIDController.js";
import { downloadImage } from "../utils/utils.js";
import { saveAuthToDatabase } from "../database/personDatabase.js";
import fetch from 'node-fetch';
import moment from "moment";


const getToken = async (id_barrio) => {
  
  const url_api = process.env.URL_API;
  const username = process.env.API_USERNAME;
  const password = process.env.API_PASSWORD;
  // const id_barrio = process.env.ID_BARRIO;

  const url = url_api + "/getToken";

  var options = {
    method: 'get',
    headers: {
      'idBarrio': id_barrio
      ,'Authorization': `Basic ${btoa(`${username}:${password}`)}`
    },
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (data.code == 200) {
    return data.data.token;
  } else {
    console.error("Error getting token: ", data.message);
  }

}

const getAuthorizations = async () => {

  try {
    const url_api = process.env.URL_API;
    const id_barrio = process.env.ID_BARRIO;
    const guard_post = process.env.GUARD_POST_NAME;
    const id_barrios_sync = process.env.ID_BARRIOS_SYNC;

    const token = await getToken(id_barrio);
    
    if (token) {
      var paramgates = gates.join(",");

      const typesParam = buildTypesParam();
      const withPictureParam = buildWithPictureParam();

      const params = "?types=" + typesParam + "&with_picture=" + withPictureParam + "&gates=" + paramgates + "&guard_post=" + guard_post + "&idBarriosSync=" + id_barrios_sync;
      const url = url_api + "/accesscontrol/authorization/sync/all" + params;

      var options = {
        'method': 'GET',
        'headers': {
          'idBarrio': id_barrio,
          'Authorization': `Bearer ${token}`
        }
      };
    
      try {
      
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (data.code == 200) {     
          console.log(data.data.NEW.length + " records recived to add");

          if(data.data.NEW.length > 0){
              precessNews(data.data.NEW);
          }

          console.log(data.data.DELETE.length + " records recived to delete");

          if(data.data.DELETE.length > 0){
              precessNews(data.data.DELETE, true);
          }
        } else {
          console.error("Error getting auths: ", data.message);
        }

      } catch (error) {
        console.error("Error getting auths: ", error);
        return false;
      }
    
    }

  } catch (error) {
    if (error.code == "ENOTFOUND") {
      console.error("Error getting auths: OFFLINE (without internet connection)");
    } else {  
      console.error("Error getting auths: ", error.code);
    }
    return false;
  }
}

// Turns a comma-separated string from .env-be ("105,108, 200") into a clean
// array of trimmed values, ignoring empty entries.
const parseFilterList = (value) => {
  if (!value) return [];
  return value.split(",").map((v) => v.trim()).filter((v) => v !== "");
};

// Decides whether a lote/categoria is "this docker's business", based on
// the filter configured from the admin panel (PERSON_FILTER_MODE and the
// BLOCKLIST_*/ALLOWLIST_* lists). Applied to BOTH new records and deletes:
// each docker instance normally represents one physical gate (a specific
// set of lotes/categorias), so a DELETE for a lote this docker was never
// supposed to load in the first place isn't this docker's concern either -
// acting on it could wrongly remove the person from a device where they
// still have a separate, still-valid reason to have access (e.g. someone
// with access to both "entrada general" and "gimnasio" loses their gym
// authorization - only the gimnasio docker's filter should let that
// deletion through; the entrada general docker should leave them alone).
// Construye el parametro "types" de la sincronizacion a partir de la
// configuracion del panel de admin (SYNC_TYPE_RESIDENT_MODE/_CATEGORIES,
// SYNC_TYPE_PERMANENT_MODE/_CATEGORIES, SYNC_TYPE_TEMPORAL_MODE/_CATEGORIES).
// Cada tipo puede estar en modo "all" (manda "<tipo>-ALL"), "custom" (una
// entrada "<tipo>-<CATEGORIA>" por cada categoria separada por coma, usando
// el mismo parseo que el filtro de lote/categoria) o "none"/sin configurar
// (no se incluye ese tipo). Si NINGUNO de los tres esta configurado todavia
// (instalacion existente recien actualizada, antes de tocar nada en el
// panel), se usa el valor que estaba hardcodeado antes de este cambio, para
// no alterar el comportamiento de nadie sin que lo configure explicitamente
// desde el panel.
const SYNC_TYPE_DEFS = [
  { envKey: "RESIDENT", prefix: "resident" },
  { envKey: "PERMANENT", prefix: "permanent" },
  { envKey: "TEMPORAL", prefix: "temporal" },
];

const buildTypesParam = () => {
  const parts = [];
  let anyConfigured = false;

  for (const { envKey, prefix } of SYNC_TYPE_DEFS) {
    const mode = process.env["SYNC_TYPE_" + envKey + "_MODE"];

    if (mode !== undefined && mode !== "") {
      anyConfigured = true;
    }

    if (mode === "all") {
      parts.push(prefix + "-ALL");
    } else if (mode === "custom") {
      const categories = parseFilterList(process.env["SYNC_TYPE_" + envKey + "_CATEGORIES"]);
      categories.forEach((cat) => parts.push(prefix + "-" + cat));
    }
    // mode === "none" o sin valor: no se agrega nada para este tipo.
  }

  if (!anyConfigured) {
    return "resident-ALL,permanent-SOCIO"; // comportamiento de siempre, sin configurar nada
  }

  return parts.join(",");
};

// SYNC_WITH_PICTURE (panel de admin): "1" (default, comportamiento de
// siempre) trae solo personas que ya tienen foto cargada en el servidor
// central; "0" trae tambien a las que todavia no tienen foto, para poder
// cargarlas de alta solo con tarjeta/DNI (ver precessNews y
// faceIDController.js callDigest, que ya soportan userInfo.image_url nulo).
const buildWithPictureParam = () => {
  return process.env.SYNC_WITH_PICTURE === "0" ? "0" : "1";
};

const isFilteredOut = (uf, category) => {
  const mode = (process.env.PERSON_FILTER_MODE || "none").toLowerCase();
  const loteStr = uf !== undefined && uf !== null ? uf.toString() : "";
  const categoriaStr = category !== undefined && category !== null ? category.toString() : "";

  if (mode === "blocklist") {
    const blockedLotes = parseFilterList(process.env.BLOCKLIST_LOTES);
    const blockedCategorias = parseFilterList(process.env.BLOCKLIST_CATEGORIAS);
    return blockedLotes.includes(loteStr) || blockedCategorias.includes(categoriaStr);
  }

  if (mode === "allowlist") {
    const allowedLotes = parseFilterList(process.env.ALLOWLIST_LOTES);
    const allowedCategorias = parseFilterList(process.env.ALLOWLIST_CATEGORIAS);
    return !(allowedLotes.includes(loteStr) || allowedCategorias.includes(categoriaStr));
  }

  return false; // mode "none" (o no configurado): no se descarta a nadie
}

const precessNews = async (auths, onlyDelete=false) => {

  var date_from, hour_from, date_to, hour_to;

  for (const auth of auths) {

    try {

      // Base de datos local (v2): se guarda/borra esta autorizacion puntual
      // de esta persona, MENOS "user" y "resident_phones", sin importar si
      // despues el filtro de lote/categoria la descarta para este equipo
      // puntual - esta base es de "quien es esta persona y a que lotes
      // esta autorizada", separada de "a que equipos tiene acceso este
      // docker". onlyDelete=true borra esa autorizacion puntual en vez de
      // guardarla (ver saveAuthToDatabase).
      saveAuthToDatabase(auth, onlyDelete);

      if (isFilteredOut(auth.uf, auth.category)) {
        console.log(`Persona ${auth.individual?.document} ${onlyDelete ? "(baja) " : ""}descartada por el filtro de lote/categoria (lote=${auth.uf}, categoria=${auth.category}) - no le corresponde a este equipo.`);

        // Igual se manda el ACK (uno por cada gate/equipo de este docker,
        // como cuando sí se procesa) para que el servidor central sepa que
        // esta autorizacion ya fue recibida y evaluada por este equipo -
        // aunque se haya descartado por el filtro - y no la siga
        // reenviando en cada sincronizacion.
        for (const gate of gates) {
          sendAck(auth.id, gate);
        }

        continue;
      }

      var today = new Date();
      
      date_from = today.getFullYear() + "-" +  (today.getMonth() + 1).toString().padStart(2, "0") + "-01" ;
      hour_from = "00:00:00";  

      if (!auth.dates){
        // continue;
        date_to = "2037-12-31"; // Maximun date allowed by Face id
        hour_to = "23:59:59";
      } else {
                    
        // Set begin date to one day before due face id issue
        // var beginDate = new Date(auth.dates.auth_date_from);
        // beginDate.setDate(beginDate.getDate() - 1);

        // const begin_date = beginDate.getFullYear() + "-" 
        //                   + (beginDate.getMonth() + 1).toString().padStart(2, "0") + "-" 
        //                   +  beginDate.getDate().toString().padStart(2, "0")
        //                   + "T00:00:00"
            
        if (auth.dates.auth_date_to !== null && auth.dates.auth_date_to != "0000-00-00") {
          date_to = auth.dates.auth_date_to;
          hour_to = auth.dates.auth_hour_to;
        } else {
          date_to = "2037-12-31"; // Maximun date allowed by Face id
          hour_to = "23:59:59";
        }
      }
      
      const id_auth = auth.id;

      // Antes esto asumia que auth.individual.images siempre tenia al menos
      // una foto (auth.individual.images[0].full_picture_url sin chequear
      // nada) - con SYNC_WITH_PICTURE=0 el servidor central puede devolver
      // tambien personas sin foto cargada todavia, y eso rompia aca mismo
      // (TypeError, "Cannot read properties of undefined") antes de llegar
      // a procesar a la persona.
      const images = auth.individual.images;
      const hasPicture = Array.isArray(images) && images.length > 0;
      const imageUrl = hasPicture ? images[0].full_picture_url : null;

      const userInfo = {
                      document: auth.individual.document.toString(),
                      fullname: auth.individual.name + " " + auth.individual.lastname,
                      beginTime: date_from + "T" + hour_from,
                      endTime: date_to + "T" + hour_to,
                      uf: auth.uf.toString(),
                      lote: auth.uf.toString(),
                      eventType: "NEW_INDIVIDUAL",
                      image_url: imageUrl,
                      category_id: auth.category,
                      id_auth: id_auth,
                      id_barrio: auth.individual.id_barrio,
                      panic_card_number: auth.individual.panic_card_number,
                      id_hash: auth.id_hash
                    };

      if (hasPicture) {
        downloadImage(imageUrl, `./images/${auth.individual.document}.jpg`);
      } else {
        console.log(`Persona ${auth.individual.document}: sin foto, se da de alta sin enrolar cara (solo tarjeta/DNI).`);
      }

      const response = await processUser(userInfo, onlyDelete);

      // if (response) {
        
      //   sendAck(id_auth);

      // } 

    } catch (error) {
      console.error("Error processing news: ", error);
      continue;
    }
  }

  
}

const sendAck = async (id_auth, gate) => {
    
  try {

    const processed_at = moment().format('YYYY-MM-DD HH:mm:ss');
    const url_api = process.env.URL_API;
    const id_barrio  = process.env.ID_BARRIO; 
    
    const token = await getToken(id_barrio);

    if (token) {

      const url = url_api + "/accesscontrol/authorization/sync/ackProcessed";

      const body = {
                    "auths": [
                              {
                                "status": true,
                                "id_auth": id_auth,
                                "gate": gate,
                                "details": "The autorization was processed successful",
                                "date": processed_at
                              }
                            ]
                          };

      var options = {
        'method': 'PUT',
        'headers': {
          'idBarrio': id_barrio,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      };

      console.log("Sending ACK auth " + id_auth);

      const response = await fetch(url, options);
      const data = await response.json();  
      if (data.code == 200) {
        console.log("ACK auth " + id_auth + " for Gate " + gate + " sended OK");
        return true;
      } else {
        console.log("ACK auth " + id_auth + " for Gate " + gate + " sended with error: " + data.message);
        return false;
      }

    }

  } catch (error) {
    console.error("Error sending ack: ", error);
    return false;
  }
  
}

const saveEntryLog = async (document, uf, plate, eventDateTime, id_barrio) => {
  
  try {

    console.log("Sending log Entry...");

    const url_api = process.env.URL_API;
    //const id_barrio  = process.env.ID_BARRIO; 
    
    var car = {};

    if (plate != "") {

      // Add car
      
      const responseCar = await addCar(document, plate, id_barrio)

      car = {"plate": plate};
    }

    const token = await getToken(id_barrio);

    if (token) {

      const url = url_api + "/accesscontrol/individual/" + document + "/entry";

      const body = {
                      "individual": {
                                    "car": car
                                    },
                      "uf": [uf],
                      "notify": false,
                      "timestamp": eventDateTime
                    };

      var options = {
        'method': 'POST',
        'headers': {
          'idBarrio': id_barrio,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      };

      const response = await fetch(url, options);
      const data = await response.json();
      console.log("Log entry saving response: " + data.code + " " + data.message );

      return true;
    }

  } catch (error) {
    console.error("Error saving log entry: ", error);
    return false;
  }
}

const saveExitLog = async (document, eventDateTime, id_barrio) => {
    
  try {

    console.log("Sending log Exit...");

    const url_api = process.env.URL_API;
    // const id_barrio  = process.env.ID_BARRIO; 
    
    const token = await getToken(id_barrio);

    if (token) {

      const url = url_api + "/accesscontrol/individual/" + document + "/exit";

      const body = {
                      "notify": false,
                      "timestamp": eventDateTime
                    };

      var options = {
        'method': 'POST',
        'headers': {
          'idBarrio': id_barrio,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      };

      const response = await fetch(url, options);
      return true;
    }
  
  } catch (error) {
    console.error("Error saving log exit: ", error);
    return false;
  }

}

const addCar = async (document, plate, id_barrio) => {
  
  try {

    console.log("Adding Car...");

    const url_api = process.env.URL_API;
    //const id_barrio  = process.env.ID_BARRIO; 
    
    const token = await getToken(id_barrio);

    if (token) {

      const url = url_api + "/accesscontrol/individual/" + document + "/car";

      const body = {
                    "plate": plate,
                    "brand": "",
                    "vtv_exp_date": "",
                    "insurance_exp_date": "",
                    "images": []
                  };

      var options = {
        'method': 'POST',
        'headers': {
          'idBarrio': id_barrio,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      };

      const response = await fetch(url, options);
      const data = await response.json();
      console.log("Add car response:" + data.code + " " + data.message );
      return true;
    }

  } catch (error) {
    console.error("Error adding car: ", error);
    return false;
  }
}

// Keeps a handle to the currently-running sync interval, so it can be torn
// down and recreated with a new period when TIME_SYNC changes from the
// admin panel - a plain setInterval can't have its delay changed after the
// fact, it has to be cleared and set up again.
let syncIntervalHandle = null;

const startSync = () => {
  const tymeSync = process.env.TIME_SYNC;

  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
  }

  if (tymeSync > 0) {

    console.log("Synchronization enabled.");

    syncIntervalHandle = setInterval(() => {
      console.log("Getting auths..." + moment().format('YYYY-MM-DD HH:mm:ss'));
      getAuthorizations();

    }, tymeSync);

  } else {
    console.log("Synchronization disabled.");
  }
}

export {getAuthorizations, saveEntryLog, saveExitLog, sendAck, startSync};
