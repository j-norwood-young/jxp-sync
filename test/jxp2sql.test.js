const Jxp2Sql = require("../libs/jxp2mysql");

describe("JXP2MySql", () => {
    const jxp2mysql = new Jxp2Sql();
    test("It should connect to MySql", async () => {
        expect(jxp2mysql).toBeDefined();
        // await jxp2mysql.connect();
        // expect(response.statusCode).toBe(302);
        // expect(response.headers.location).toBe("/login");
    });
    test("It should get a schema", async () => {
        const result = await jxp2mysql.schema("checkin");
        expect(result).toHaveLength(12);
        expect(result).toContainEqual({ name: '_id', type: 'VARCHAR(24)', original: '_id' });
        expect(result).toContainEqual({ name: 'timestamp', type: 'DATETIME', original: 'timestamp' });
    })
    test("It should create a table", async () => {
        const result = await jxp2mysql.create_table("checkin");
        expect(result).toBeTruthy();
    })
    test("It should insert a row into a table", async() => {
        const data = {
            "_deleted": false,
            "_id": "5f9036a079ab323a27e60547",
            "user_id": "5e1c019def093954d24fd79f",
            "source": "admin_users",
            "state": "checkin",
            "_owner_id": "54572f17750888091d639732",
            "createdAt": "2020-10-21T13:24:48.476Z",
            "updatedAt": "2020-10-21T13:24:48.476Z",
            "__v": 0,
            "timestamp": "2020-10-21T13:24:48.476Z",
            "id": "5f9036a079ab323a27e60547"
        }
        const result = await jxp2mysql.insert_row("checkin", data);
        expect(result.affectedRows).toBe(1);
    })
    test("It should update a row in a table", async() => {
        const data = {
            "_deleted": true,
        }
        const result = await jxp2mysql.update_row("checkin", "5f9036a079ab323a27e60547", data);
        expect(result.affectedRows).toBe(1);
    })
    test("It should clear a table", async() => {
        const result = await jxp2mysql.clear_table("checkin");
        expect(result.affectedRows).toBe(0);
    })
    test("It should upload a collection", async() => {
        const result = await jxp2mysql.upload_collection("checkin");
        expect(result[0].affectedRows).toBeGreaterThan(1);
    })
    test("It should delete a table", async () => {
        const result = await jxp2mysql.delete_table("checkin");
        expect(result).toBeTruthy();
    })
});