const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

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
    const addClassesCollection = client
      .db("athletiCamp")
      .collection("addClass");
    const usersCollection = client.db("athletiCamp").collection("users");
    const selectedClassesCollection = client
      .db("athletiCamp")
      .collection("selectedClasses");
    const enrolledClassesCollection = client
      .db("athletiCamp")
      .collection("enrolledClasses");
    const paymentCollection = client.db("athletiCamp").collection("payment");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyUser = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        const instructorQuery = {
          email: email,
          role: "instructor",
        };
        const instructor = await usersCollection.findOne(instructorQuery);
        if (!instructor) {
          res.status(403).send({ error: true, message: "Forbidden message" });
        }
      }
      next();
    };

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
    app.get("/users", verifyJWT, async (req, res) => {
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

    app.get("/users/admin/:email", verifyJWT, verifyUser, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.get(
      "/users/instructor/:email",
      verifyJWT,
      verifyUser,
      async (req, res) => {
        const email = req.params.email;

        if (req.decoded.email !== email) {
          res.send({ instructor: false });
        }

        const query = { email: email };
        const user = await usersCollection.findOne(query);
        const result = { instructor: user?.role === "instructor" };
        res.send(result);
      }
    );

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const newRole = req.body.role;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: newRole,
        },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // selected classes api
    app.get("/selectedClasses", async (req, res) => {
      const result = await selectedClassesCollection.find().toArray();
      res.send(result);
    });

    app.post("/selectedClasses", async (req, res) => {
      const selectedClasses = req.body;
    //   const query = {
    //     $and: [
    //         { classId: selectedClasses.classId },
    //         { email: selectedClasses.email }
    //     ]
    // }

    // const isExist = await selectedCollection.findOne(query)

    // if (isExist) {
    //     return res.send({ message: 'exists' })
    // }
      const result = await selectedClassesCollection.insertOne(selectedClasses);
      res.send(result);
    });

    app.delete("/selectedClasses/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: id };
      const result = await selectedClassesCollection.deleteOne(query);
      res.send(result);
    });

    // payment
    app.post("/dashboard/payment/:id", verifyJWT, async (req, res) => {
      const classId = req.params.id;
      const { paymentMethodId, paymentAmount } = req.body;
      const query = { _id: new ObjectId(classId) };

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: paymentAmount * 100,
          currency: "usd",
          payment_method: paymentMethodId,
          confirm: true,
        });

        if (paymentIntent.status === "succeeded") {
          const selectedClass = await selectedClassesCollection.findOne({
            _id: classId,
          });

          const enrolledClass = {
            _id: selectedClass._id,
            image: selectedClass.image,
            className: selectedClass.name,
            instructor: selectedClass.instructor,
            totalStudents: selectedClass.totalStudents,
            remainingSeats: parseInt(selectedClass.remainingSeats),
            price: selectedClass.price,
          };

          await enrolledClassesCollection.insertOne(enrolledClass);
          await selectedClassesCollection.deleteOne({ _id: classId });

          const remainingClass = await classesCollection.findOne(query);
          const updatedRemainingSeats = remainingClass?.availableSeats - 1;
          const updateTotalStudents = remainingClass?.totalStudents + 1;

          await classesCollection.updateOne(query, {
            $set: {
              availableSeats: updatedRemainingSeats,
              totalStudents: updateTotalStudents,
            },
          });

          const paymentData = {
            classId: classId,
            paymentMethodId: paymentMethodId,
            paymentAmount: paymentAmount,
            date: new Date(),
          };

          const result = await paymentCollection.insertOne(paymentData);

          res.status(200).send({ message: "Payment successful", result });
        } else {
          res.status(400).send({ message: "Payment failed" });
        }
      } catch (error) {
        console.log(error);
        res
          .status(500)
          .send({ message: "An error occurred during payment processing" });
      }
    });

    app.get("/payment", async (req, res) => {
      const result = await paymentCollection
        .find()
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/enrolledClasses", async (req, res) => {
      const result = await enrolledClassesCollection.find().toArray();
      res.send(result);
    });

    // Add a classes api
    app.post("/addClass", verifyJWT, verifyUser, async (req, res) => {
      const classData = req.body;
      const result = await addClassesCollection.insertOne(classData);
      res.send(result);
    });

    app.get("/myClasses", verifyJWT, async (req, res) => {
      const result = await addClassesCollection.find().toArray();
      res.send(result);
    });

    // manage class related api
    app.get("/manageClasses", verifyJWT, async (req, res) => {
      const result = await addClassesCollection.find().toArray();
      res.send(result);
    });

    app.put("/manageClasses/:id/role", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status,
        },
      };
      const result = await addClassesCollection.updateOne(filter, updatedDoc);
      if (status === "approved") {
        const classData = await addClassesCollection.findOne(filter);
        if (classData) {
          const insertResult = await classesCollection.insertOne(classData);
          console.log(
            "Class moved to classesCollection:",
            insertResult.insertedId
          );
        }
      }
      res.send(result);
    });

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
