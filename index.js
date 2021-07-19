const Jxp2Sql = require("./libs/jxp2mysql");
const { Command } = require('commander');
const program = new Command();
const MongoStream = require("./libs/mongo-stream");

program
.option('-c, --collections <collections...>', 'JXP collection')
.option('-s, --setup', 'setup')
.option('-u, --upload', 'upload')
.option('-t, --truncate', 'truncate')
.option('-d, --daemon', 'daemon mode')
;

program.parse(process.argv);
const options = program.opts();

const main = async () => {
    try {
        console.log(options);
        if (!options.collections) throw "Collection required";
        const collections = options.collections;

        if (options.setup) {
            for (let collection of collections) {
                console.log(`Setting up ${collection}`);
                const jxp2sql = new Jxp2Sql();
                await jxp2sql.connect();
                await jxp2sql.create_table(collection)
                console.log(`Done Setting up ${collection}`);
            }
        }
        if (options.truncate) {
            for (let collection of collections) {
                console.log(`Truncating ${collection}`);
                await jxp2sql.clear_table(collection);
                console.log(`Done Truncating ${collection}`);
            }
        }
        if (options.upload) {
            for (let collection of collections) {
                console.log(`Uploading ${collection}`);
                const jxp2sql = new Jxp2Sql();
                await jxp2sql.connect();
                await jxp2sql.upload_collection(collection)
                console.log(`Done Uploading ${collection}`);
            }
        }
        if (options.daemon) {
            const mongostream = new MongoStream();
            await mongostream.connect()
            for (let collection of collections) {
                console.log(`Running daemon ${collection}`);
                mongostream.watch(collection);
            }
        } else {
            process.exit(0);
        }
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

main();