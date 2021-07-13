const config = require("config");
const Kafka = require('@revengine/common/kafka');
const conversions = require("./conversions");
const mysql = require("mysql");
const moment = require("moment");
require("dotenv").config();

class KafkaMysqlStream {
    constructor() {
        this.connection = null;
    }

    async run() {
        console.log("running KafkaMysqlStream")
        this.mysqlConnect = await this.connect();
        this.consumer = new Kafka.KafkaConsumer({ topic: "mongodb_stream", debug: false });
        this.consumer.on("message", async data => {
            try {
                
                if (data.event === "insert") {
                    let converted_data = this.convert_data(data.table, data.document);
                    if (!converted_data) return;
                    converted_data.date_updated = this.sql_time(data.document.createdAt);
                    const sql = this.upsert(data.table, converted_data);
                    console.log(sql);
                    await this.query(sql);
                } else if (data.event === "update") {
                    let converted_data = this.convert_data(data.table, data.updated_fields);
                    if (!converted_data) return;
                    if (Object.keys(converted_data).length === 0) return; // Nothing to update
                    converted_data.uid = data._id;
                    converted_data.date_updated = this.sql_time(data.updated_fields.updatedAt);
                    const sql = this.upsert(data.table, converted_data);
                    await this.query(sql);
                }
            } catch(err) {
                console.error(err);
            }
        })
    }

    connect() {
        this.connection = mysql.createConnection({
            host: config.mysql.host || "localhost",
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: config.mysql.database || "revengine"
        });
        return new Promise((resolve, reject) => {
            this.connection.connect(err => {
                if (err) return reject(err);
                console.log("Connected to MySql");
                resolve();
            });
        })
    }

    query (query) {
        return new Promise((resolve, reject) => {
            this.connection.query(query, (err, result) => {
                if (err) return reject(err);
                return resolve(result);
            })
        })
    }

    convert_data(table, row) {
        const conversion = conversions.find(conversion => conversion.table === table);
        if (!conversion) return null;
        try {
            let newrow = {};
            for (let fieldname in row) {
                if (conversion.relationships[fieldname]) {
                    newrow[fieldname] = conversion.relationships[fieldname](row);
                }
            }
            return newrow;
        } catch(err) {
            console.log("Hit an error");
            console.log(row);
            console.error(err);
        }
    }

    upsert(table, record) {
        const keys = Object.keys(record);
        const values = Object.values(record);
        let update = [];
        for (let key of keys) {
            update.push(`${key} = ${ this.connection.escape(record[key])}`);
        }
        return `INSERT INTO ${table} (${ keys.join(",") }) VALUES (${ values.map(d => this.connection.escape(d)).join(",") }) ON DUPLICATE KEY UPDATE ${ update.join(",") }`;
    }

    sql_time(d) {
        if (d) return moment(d).format('YYYY-MM-DD HH:mm:ss');
        return moment().format('YYYY-MM-DD HH:mm:ss');
    }
}

module.exports = KafkaMysqlStream;