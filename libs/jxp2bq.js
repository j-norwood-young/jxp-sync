const config = require("config");
const Apihelper = require("@workspaceman/openmembers/libs/apihelper");
const {BigQuery} = require('@google-cloud/bigquery');
const bigquery = new BigQuery({
	projectId: config.google.projectId,
	keyFilename: config.google.keyFilename
});
const moment = require("moment");
const fs = require("fs/promises")

const type_conversion_table = {
    Boolean: "BOOL",
    Date: "DATETIME",
    ObjectID: "STRING",
    Number: "NUMERIC",
    String: "STRING",

}

function mysql_real_escape_string (str) {
    return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
        switch (char) {
            case "\0":
                return "\\0";
            case "\x08":
                return "\\b";
            case "\x09":
                return "\\t";
            case "\x1a":
                return "\\z";
            case "\n":
                return "\\n";
            case "\r":
                return "\\r";
            case "\"":
            case "'":
            case "\\":
            case "%":
                return "\\"+char; // prepends a backslash to backslash, percent,
                                  // and double/single quotes
        }
    });
}

class JXP2BQ {
    constructor(opts) {
        this.table = opts.table;
        this.collection = opts.collection;
        this.apihelper = new Apihelper({ apikey: config.apikey });
        this.dataset = bigquery.dataset(config.bigquery.datasetId);
    }

    async prep_data(data) {
        try {
            const schema = await this.schema(this.collection);
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

    async schema() {
        try {
            const bq_model = [];
            const field_name_re = /^[a-zA-Z0-9_]*$/
            const model = await this.apihelper.model(this.collection);
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
            // console.log(bq_model);
            return bq_model;
        } catch(err) {
            console.trace(err);
        }
    }

    async create_table() {
        try {
            const schema = await this.schema();
            const [table] = await this.dataset.createTable(this.collection, schema);
            console.log(`Table ${table.id} created.`);
            return table;
        } catch(err) {
            console.trace(err);
        }
    }

    async clear_table() {
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

    async upload_collection() {
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
            console.log(result);
        } catch(err) {
            console.log("Error!");
            console.error(err);
            console.log(JSON.stringify(err, null, "   "));
        }
    }

    async delete_table() {
        try {
            const table = this.dataset.table(this.collection);
            await table.delete();
        } catch(err) {
            console.log(JSON.stringify(err, null, "   "));
        }
    }

    async update_table() {
        try {
            const table = this.dataset.table(this.collection);
            const [metadata] = await table.getMetadata();
            metadata.schema = await this.schema(this.collection);
            await table.setMetadata(metadata);
            return true;
        } catch(err) {
            console.log(JSON.stringify(err, null, "   "));
        }
    }

    async insert_row(table_name, data, uid) {
        try {
            const table = this.dataset.table(table_name);
            const prepped_data = await this.prep_data([data]);
            await table.insert(prepped_data);
        } catch(err) {
            return Promise.reject(err);
        }
    }

    async update_row(table_name, _id, data, uid) {
        try {
            console.log({_id, data })
            const table = this.dataset.table(table_name);
            const prepped_data = await this.prep_data([data]);
            const updates = [];
            for (let row of prepped_data) {
                for (let i in row) {
                    console.log(i, row[i])
                    updates.push(`${i} = "${mysql_real_escape_string(row[i])}"`)
                }
            }
            const sql = `UPDATE ${table_name} SET ${updates.join(", ")} WHERE _id="${_id}"`;
            console.log({sql});
            const [job] = await this.dataset.createQueryJob(sql);
            const [result] = await job.getQueryResults();
            console.log(result);
        } catch(err) {
            console.error(err);
            return Promise.reject(err);
        }
    }
}

module.exports = JXP2BQ;