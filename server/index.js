const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv").config();

const app = express();
const PORT = 3000;

// models
const User = require("./models/user");
const Post = require("./models/post");

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

mongoose
  .connect(`${process.env.DB_URL}`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Database Connected");
  })
  .catch((e) => {
    console.log(e);
  });

// endpoint
// registering a user
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // checking existing user
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: "email already exists" });
    }

    // create new user
    const newUser = new User({ name, email, password });

    // generate and store verification token
    newUser.vertificationToken = crypto.randomBytes(20).toString("hex");

    // save the user
    await newUser.save();

    // send verification email to user
    sendVerificationEmail(newUser.email, newUser.vertificationToken);

    res.status(200).json({ message: "registration successfull" });
  } catch (error) {
    console.log("error registering user", error);
    res.status(500).json({ message: "error registering user" });
  }
});

// sending verification mail
const sendVerificationEmail = async (email, verificationToken) => {
  // create a nodemailer transporter
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: `${process.env.MAIL}`,
      pass: `${process.env.PASSWORD}`,
    },
  });

  // compose the email message
  const mailOptions = {
    from: "threads.com",
    to: email,
    subject: "Email Verification",
    text: `Please click the following link to verify your email http://localhost:3000/verify/${verificationToken}`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.log("error sending email", error);
  }
};

// endpoint
// verify token
app.get("/verify/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const user = await User.findOne({ vertificationToken: token });

    if (!user) {
      return res.status(404).json({ message: "invalid token" });
    }

    user.verified = true;
    user.vertificationToken = undefined;

    await user.save();

    res.status(200).json({ message: "email verified successfully" });
  } catch (error) {
    console.log("error getting token", error);
    res.status(500).json({ message: "email verification failed" });
  }
});

const generateSecretKey = () => {
  const secretKey = crypto.randomBytes(32).toString("hex");
  return secretKey;
};

const secretKey = generateSecretKey();

// endpoint
// login user
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "invalid email" });
    }

    if (user.password !== password) {
      return res.status(404).json({ message: "invalid password" });
    }

    const token = jwt.sign({ userId: user._id }, secretKey);

    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ message: "login failed" });
  }
});

// endpoint
// access all users
app.get("/user/:userId", async (req, res) => {
  try {
    const loggedInUserId = req.params.userId;
    User.find({ _id: { $ne: loggedInUserId } })
      .then((users) => {
        res.status(200).json(users);
      })
      .catch((error) => {
        console.log("error", error);
        res.status(500).json("error");
      });
  } catch (error) {
    res.status(500).json({ message: "error getting users" });
  }
});

// endpoint
// follow a user
app.post("/follow", async (req, res) => {
  const { currentUserId, selectedUserId } = req.body;
  try {
    await User.findByIdAndUpdate(selectedUserId, {
      $push: { followers: currentUserId },
    });
    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "error in following a user" });
  }
});

// endpoint
// unfollow a user
app.post("/unfollow", async (req, res) => {
  const { loggedInUserId, targetUserId } = req.body;
  try {
    await User.findByIdAndUpdate(targetUserId, {
      $pull: { followers: loggedInUserId },
    });

    res.status(200).json({ message: "Unfollowed successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "error in unfollowing a user" });
  }
});

// endpoint
// create a new post
app.post("/create-post", async (req, res) => {
  try {
    const { content, userId } = req.body;

    const newPostData = {
      user: userId,
    };

    if (content) {
      newPostData.content = content;
    }

    const newPost = new Post(newPostData);

    await newPost.save();

    res.status(200).json({ message: "post created successfully" });
  } catch (error) {
    res.status(500).json({ message: "error creating post" });
  }
});

// endpoint
// liking a post
app.put("/post/:postId/:userId/like", async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.params.userId;

    const post = await Post.findById({ postId }).populate("user", "name");

    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $addToSet: { likes: userId } },
      { new: true }
    );

    if (!updatedPost) {
      return res.status(404).json({ message: "post not found" });
    }

    updatedPost.user = post.user;

    res.json(updatedPost);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "error while liking" });
  }
});

//endpoint
// unlike a post
app.put("/post/:postId/:userId/unlike", async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.params.userId;

    const post = await Post.findById({ postId }).populate("user", "name");

    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $pull: { likes: userId } },
      { new: true }
    );

    if (!updatedPost) {
      return res.status(404).json({ message: "post not found" });
    }

    updatedPost.user = post.user;

    res.json(updatedPost);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "error while liking" });
  }
});

// endpoint
// get all post
app.get("/get-posts", async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("user", "name")
      .sort({ createdAt: -1 });
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: "error getting posts" });
  }
});

// listening an app
app.listen(PORT, (req, res) => {
  console.log("Server is running on port 5000");
});
