export default class AccessControlEvent {
   
    id = '';
	name = '';
	lote = '';
	UF = '';
    category_id = '';
    event_type = '';
    id_barrio = ''; //process.env.ID_BARRIO;
    picture = '';
    isPanic = 0;
    deviceName = '';
    
    constructor(id, name, lote, uf, event_type, category_id, id_barrio, isPanic, deviceName) {
        this.id = id;
        this.name = name;
        this.lote = lote;
        this.UF = uf;
        this.category_id = category_id;
        this.event_type = event_type;
        this.id_barrio = id_barrio;
        this.isPanic = isPanic;
        this.deviceName = deviceName;
    }

    setPicture(newPicture){
        this.picture = newPicture;
    }  

};
