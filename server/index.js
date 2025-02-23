import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { connectDB } from "./db.js";
import { ObjectId } from "mongodb";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
// JWT verification middleware
const verifyToken = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token)
    return res
      .status(401)
      .json({ message: "Access Denied! No token provided." });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ message: "Invalid Token" });
  }
};
const PORT = process.env.PORT || 5000;
app.post("/api/signup", async (req, res) => {
  const { email, password } = req.body;
  try {
    const db = await connectDB();
    const userExists = await db.collection("users").findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      email,
      password: hashedPassword,
    };

    await db.collection("users").insertOne(newUser);

    // Generate JWT token
    const token = jwt.sign(
      { email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" } // Token expires in 1 hour
    );

    // Send the token in the response
    res.status(201).json({ message: "User created successfully", token });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const db = await connectDB();
    const { email, password } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }
    const user = await db.collection("users").findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET, // Secret key from environment variables
      { expiresIn: "5h" } // Token expiration (e.g., 5 hours)
    );
    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});
app.get("/api/users/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const db = await connectDB();
    const user = await db
      .collection("users")
      .findOne({ email }, { projection: { password: 0 } }); // Exclude password

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});
app.put("/api/users/:email", async (req, res) => {
  const { email } = req.params;
  const data = req.body;
  try {
    const db = await connectDB();
    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ email });
    console.log(user);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    await usersCollection.updateOne({ email }, { $set: data });
    res.json({ message: "User information updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/api/google-auth", async (req, res) => {
  const { uid, email, displayName, photoURL } = req.body;
  try {
    const db = await connectDB();
    const usersCollection = db.collection("users");

    let user = await usersCollection.findOne({ email });

    if (!user) {
      // If the user doesn't exist, create a new one
      user = {
        uid,
        email,
        displayName,
        photoURL,
      };
      await usersCollection.insertOne(user);
    }

    // Generate JWT token
    const token = jwt.sign(
      { uid: user.uid, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "5h" }
    );

    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Product Data
app.get("/api/products", async (req, res) => {
  const db = await connectDB();
  try {
    const productsCollection = db.collection("products");
    const products = await productsCollection.find().toArray();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/api/cart", async (req, res) => {
  const { productId, userEmail, quantity } = req.body;
  try {
    const db = await connectDB();
    const productObjectId = new ObjectId(productId);
    const product = await db
      .collection("products")
      .findOne({ _id: productObjectId });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    const existingUserProduct = await db.collection("userCart").findOne({
      productId,
      userEmail,
    });

    if (existingUserProduct) {
      const updatedQuantity = existingUserProduct.quantity + quantity;
      await db
        .collection("userCart")
        .updateOne(
          { productId, userEmail },
          { $set: { quantity: updatedQuantity } }
        );

      res.status(200).json({ message: "Your Product quantity Update" });
    } else {
      await db.collection("userCart").insertOne({
        productId,
        userEmail,
        quantity,
      });
      res.status(200).json({ message: "Yah, Your Product has added" });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});
app.get("/api/cart/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const db = await connectDB();

    // Find all cart items for the user
    const cartItems = await db
      .collection("userCart")
      .find({ userEmail: email })
      .toArray();

    if (cartItems.length === 0) {
      return res.status(404).json({ message: "No items found in the cart" });
    }
    res.json(cartItems);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Payment
app.post("/api/payment", async (req, res) => {
  const {
    email,
    amount,
    method,
    productIds,
    firstName,
    lastName,
    companyName,
    division,
    number,
    address
  } = req.body;
  try {
    const db = await connectDB();
    const paymentsCollection = db.collection("payments");
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const orderId = `ORD-${timestamp}-${randomString}`;
    const existingOrder = await paymentsCollection.findOne({ orderId });
    if (existingOrder) {
      return res.status(500).json({ message: "Order ID conflict detected" });
    }
    const newPayment = {
      email,
      amount,
      method,
      orderId,
      productIds,
      status: "completed",
      createdAt: new Date(),
      firstName,
      lastName,
      companyName,
      division,
      number,
      address
    };
    const paymentResult = await paymentsCollection.insertOne(newPayment);
    if (!paymentResult.acknowledged) {
      return res.status(500).json({ message: "Payment processing failed" });
    }
    const cartCollection = db.collection("userCart");
    const cartRemovalResult = await cartCollection.deleteMany({
      userEmail: email,
    });
    res.json({ message: "Payment successful", orderId, success: true });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});

app.get("/api/payment/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const db = await connectDB();

    // Find all cart items for the user
    const payment = await db.collection("payments").find({ email }).toArray();

    if (payment.length === 0) {
      return res.status(404).json({ message: "No items found in the cart" });
    }
    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});


app.get('/api/reviews', async(req, res) =>{
  const db = await connectDB();
  try {
    const reviewsCollection = db.collection("reviews");
    const review = await reviewsCollection.find().toArray();
    res.json(review);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
})
app.post('/api/reviews', async(req, res) =>{
  const {productId,email,review,stars} = req.body
  console.log(productId,email,review,stars);
  const db = await connectDB();
  try {
    const reviewData = { productId, email, review, stars,createdAt: new Date(), };
    await db.collection("reviews").insertOne(reviewData);
    res.status(200).json({ message: "Your review added" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
})


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
