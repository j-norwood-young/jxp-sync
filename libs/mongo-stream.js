const config = require("config");
const { MongoClient } = require("mongodb");
const Jxp2Sql = require("./jxp2mysql");
const pluralize = require("mongoose-legacy-pluralize");

class MongoStream {
    constructor() {
        try {
            this.client = new MongoClient(config.mongo.connection_string);
            this.changeStream = null;
            this.jxp2mysql = new Jxp2Sql();
        } catch(err) {
            console.error(err);
        }
    }

    async connect() {
        await this.jxp2mysql.connect();
        await this.client.connect();
        this.database = await this.client.db();
    }

    watch(collection) {
        try {
            const dbcollection = this.database.collection(pluralize(collection));
            this.changeStream = dbcollection.watch();
            this.changeStream.on("change", async evt => {
                try {
                    if (evt.operationType === "insert") {
                        const fullDocument = JSON.parse(JSON.stringify(evt.fullDocument));
                        await this.jxp2mysql.insert_row(collection, Object.assign({}, fullDocument));
                    } else if (evt.operationType === "update") {
                        const updatedFields = JSON.parse(JSON.stringify(evt.updateDescription.updatedFields));
                        await this.jxp2mysql.update_row(collection, evt.documentKey._id.toString(), updatedFields);
                    }
                } catch(err) {
                    console.log(JSON.stringify(err, null, "   "));
                }
            });
        } catch(err) {
            console.error(err)
        }
    }
}

module.exports = MongoStream;