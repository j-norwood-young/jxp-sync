const config = require("config");
const { MongoClient } = require("mongodb");
const Kafka = require('@revengine/common/kafka');

class MongoKafkaStream {
    constructor(table) {
        try {
            this.client = new MongoClient(config.api.mongo.connection_string);
            this.table = table;
            this.changeStream = null;
        } catch(err) {
            console.error(err);
        }
    }

    async run() {
        try {
            // console.log("Table", this.table)
            this.producer = new Kafka.KafkaProducer({ topic: "mongodb_stream", debug: false });
            await this.client.connect();
            const database = await this.client.db();
            const collection = database.collection(this.table);
            // open a Change Stream on the "movies" collection
            this.changeStream = collection.watch();
            // set up a listener when change events are emitted
            this.changeStream.on("change", async evt => {
                try {
                    // console.log(evt);
                    if (evt.operationType === "insert") {
                        await this.producer.send({ event: "insert", table: this.table, document: evt.fullDocument });
                    } else if (evt.operationType === "update") {
                        await this.producer.send({ event: "update", table: this.table, _id: evt.documentKey._id, updated_fields: evt.updateDescription.updatedFields });
                    }
                } catch(err) {
                    console.log(JSON.stringify(err, null, "   "));
                }
            });
            await new Promise(resolve => {
                // Keep us listening...
            });
        } catch(err) {
            console.error(err)
        } finally {
            await this.client.close();
        }
    }
}

module.exports = MongoKafkaStream;