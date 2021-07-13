const MongoStream = require("../libs/mongo-stream")

describe("JXP2MySql", () => {
    const mongostream = new MongoStream();
    test("It should start running", async () => {
        await mongostream.watch("checkin");
    })
});