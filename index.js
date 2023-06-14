const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Invalid authorization" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const username = process.env.DB_USERNAME;
const password = process.env.DB_USER_PASSWORD;

const uri = `mongodb+srv://${username}:${password}@cluster0.uz4gpo0.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const classesCollection = client.db("athletiCamp").collection("classes");
    const instructorsCollection = client
      .db("athletiCamp")
      .collection("instructors");
    const usersCollection = client.db("athletiCamp").collection("users");
    const selectedClassesCollection = client.db("athletiCamp").collection("selectedClasses");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    app.get("/classes", async (req, res) => {
      const classes = await classesCollection.find().toArray();
      res.send(classes);
    });

    // popular classes api
    app.get("/popular-classes", async (req, res) => {
      const topClasses = await classesCollection
        .find()
        .sort({ totalStudents: -1 })
        .limit(6)
        .toArray();
      res.send(topClasses);
    });

    // all instructors api
    app.get("/instructors", async (req, res) => {
      const instructors = await instructorsCollection.find().toArray();
      res.send(instructors);
    });

    // popular instructors api
    app.get("/popular-instructors", async (req, res) => {
      const popularInstructors = await instructorsCollection
        .find()
        .sort({ total_students: -1 })
        .limit(6)
        .toArray();
      res.send(popularInstructors);
    });

    // users collection api
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users/admin/:email', verifyJWT, async(req, res) => {
      const email = req.params.email;

      if(req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' };
      res.send(result);
    })

    app.patch('/users/admin/:id', async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    // selected classes api
    app.get('/selectedClasses', verifyJWT, async(req, res) =>{
      const result = await selectedClassesCollection.find().toArray();
      res.send(result);
    })

    app.post('/selectedClasses', verifyJWT, async(req, res) => {
      const selectedClasses = req.body;
      const result = await selectedClassesCollection.insertOne(selectedClasses);
      res.send(result);
    })

    app.delete('/selectedClass/:id', verifyJWT, async(req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassesCollection.deleteOne(query);
      res.send(result);
    })

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Athleti camp is ongoing this season");
});

app.listen(port, () => {
  console.log(`Athleti camp is ongoing this season on ${port}`);
});
