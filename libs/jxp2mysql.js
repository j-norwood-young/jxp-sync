const config = require("config");
const Apihelper = require("jxp-helper");
const mysql = require("mysql");
const moment = require("moment");
const fs = require("fs/promises")
const pluralize = require("mongoose-legacy-pluralize");
require("dotenv").config();

const type_conversion_table = {
    Boolean: "BOOLEAN",
    Date: "DATETIME",
    ObjectID: "VARCHAR(24)",
    Number: "FLOAT",
    String: "TEXT",
}

class JXP2SQL {
    constructor() {
        this.apihelper = new Apihelper({ apikey: process.env.APIKEY, server: config.jxp.server });
        this.connection = null;
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

    query(sql) {
        return new Promise((resolve, reject) => {
            this.connection.query(sql, (err, results, fields) => {
                if (err) return reject(err);
                return resolve(results);
            })
        })
    }

    async prep_data(collection, data) {
        try {
            const schema = await this.schema(collection);
            const fields = schema.map(field => field.name);
            const prepped_data = data.map(row => {
                for (let fieldtype of schema) {
                    if (fieldtype.type === "DATETIME") {
                        if (row[fieldtype.original]) {
                            row[fieldtype.original] = moment(row[fieldtype.original]).format("YYYY-MM-DDTHH:mm:ss");
                        }
                    }
                    if (fieldtype.type === "NUMERIC") {
                        if (row[fieldtype.original]) {
                            row[fieldtype.original] = Number(row[fieldtype.original]).toFixed(5);
                        }
                    }
                    if (fieldtype.type === "STRING") {
                        row[fieldtype.original] = row[fieldtype.original] ? String(row[fieldtype.original]) : null;
                    }
                }
                for (let col in row) {
                    if (!fields.includes(col)) {
                        delete(row[col]);
                    }
                    if (row[col] === null) {
                        delete(row[col]);
                    }
                }
                // Correct field names with bad characters
                for (let fieldtype of schema) {
                    if (fieldtype.name !== fieldtype.original) {
                        row[fieldtype.name] = row[fieldtype.original];
                    }
                }
                return row;
            })
            return prepped_data;
        } catch(err) {
            return Promise.reject(err);
        }
    }

    async schema(collection) {
        try {
            const bq_model = [];
            const field_name_re = /^[a-zA-Z0-9_]*$/
            const model = await this.apihelper.model(collection);
            for (let item in model) {
                let name = item;
                if (!field_name_re.test(item)) {
                    name = item.replace(/[^a-zA-Z0-9_]/g, "");
                }
                const mongo_type = model[item].instance;
                if (type_conversion_table[mongo_type]) {
                    bq_model.push({
                        name,
                        type: type_conversion_table[mongo_type],
                        original: item
                    });
                }
            }
            return bq_model;
        } catch(err) {
            console.trace(err);
        }
    }

    async create_table(collection) {
        try {
            const schema = await this.schema(collection);
            const fields = schema.map(field => {
                return `${field.name} ${field.type}${field.name === "_id" ? " PRIMARY KEY" : ""}`
            }).join(", ");
            let sql = `CREATE TABLE ${pluralize(collection)} (${fields}) ENGINE InnoDB`
            const result = await this.query(sql);
            return result;
        } catch(err) {
            console.trace(err);
        }
    }

    async clear_table() { // TODO
        try {
            let table = this.dataset.table(this.collection);
            try {
                await table.delete();
            } catch(err) {
                console.log(err.message);
            }
            await this.create_table();
        } catch(err) {
            return Promise.reject(err);
        }
    }

    async upload_collection() { // TODO
        try {
            // await this.clear_table();
            let table = this.dataset.table(this.collection);
            const [exists] = await table.exists()
            if (!exists) {
                console.log("Table doesn't exist, creating...")
                await this.create_table();
                // return;
            }
            const [metadata] = await table.getMetadata();
            metadata.schema = await this.schema(this.collection);
            const fields = metadata.schema.map(field => field.name);
            const [apiResponse] = await table.setMetadata(metadata);
            const data = (await this.apihelper.get(this.collection, { fields: fields.join(",") })).data;
            if (!data.length) {
                console.log("No records to update at this point");
                return;
            }
            // console.log({data});
            const prepped_data = await this.prep_data(data);
            const fname = `/tmp/${this.collection}.json`;
            const fh = await fs.open(fname, 'w');
            for (let row of prepped_data) {
                await fh.write(JSON.stringify(row) + "\n");
            }
            fh.close();
            // console.log({prepped_data});
            const result = await table.load(fname, { format: "JSON", writeDisposition: 'WRITE_TRUNCATE', });
        } catch(err) {
            console.log("Error!");
            console.error(err);
            console.log(JSON.stringify(err, null, "   "));
        }
    }

    async delete_table(collection) {
        try {
            const sql = `DROP TABLE ${pluralize(collection)}`;
            const result = await this.query(sql);
            return result;
        } catch(err) {
            console.log(JSON.stringify(err, null, "   "));
        }
    }

    async update_table() { //TODO
        try {
            const [metadata] = await table.getMetadata();
            metadata.schema = await this.schema(this.collection);
            await table.setMetadata(metadata);
            return true;
        } catch(err) {
            console.log(JSON.stringify(err, null, "   "));
        }
    }

    async insert_row(collection, data) { // TODO
        try {
            const [prepped_data] = await this.prep_data(collection, [data]);
            // console.log(prepped_data);
            const fields = Object.keys(prepped_data);
            const values = Object.values(prepped_data).map(d => mysql.escape(d));
            const sql = `INSERT INTO ${pluralize(collection)} (${fields.join(", ")}) VALUES (${values.join(", ")})`;
            const result = await this.query(sql);
            return result;
        } catch(err) {
            return Promise.reject(err);
        }
    }

    async update_row(collection, _id, data) { // TODO
        try {
            const [prepped_data] = await this.prep_data(collection, [data]);
            const updates = [];
            for (let i in prepped_data) {
                updates.push(`${i}=${mysql.escape(prepped_data[i])}`);
            }
            const sql = `UPDATE ${pluralize(collection)} SET ${updates.join(", ")} WHERE _id=${mysql.escape(_id)}`;
            const result = this.query(sql);
            return result;
        } catch(err) {
            console.error(err);
            return Promise.reject(err);
        }
    }
}

module.exports = JXP2SQL;