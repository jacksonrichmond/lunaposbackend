require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const cookieParser = require("cookie-parser");
const noblox = require("noblox.js");

const User = require("./sketches/UserSketch");
const Product = require("./sketches/ProductSketch");

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});

app.use(express.json());
app.use(cors({ credentials: true }));
app.use(helmet());
app.use(mongoSanitize());
app.use(cookieParser());
app.use(limiter);

const authenticateUser = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId).populate("products");
    if (!req.user) return res.status(404).json({ error: "User not found" });
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
};

app.get("/", (req, res) => {
  res.redirect("../index.html");
});

app.get("/api/auth/roblox/callback", async (req, res) => {
  const { code } = req.query;
  const userDataCookie = req.headers["___cookie"];

  if (!code) return res.status(400).json({ error: "Code not provided." });

  try {
    let existingUserData = {};
    if (userDataCookie) {
      try {
        existingUserData = JSON.parse(decodeURIComponent(userDataCookie));
      } catch (parseError) {
        console.error("Error parsing userCookie:", parseError);
      }
    }

    const tokenResponse = await fetch(
      "https://apis.roblox.com/oauth/v1/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.RBX_CLIENT_ID,
          client_secret: process.env.RBX_CLIENT_SECRET,
          code: code,
          grant_type: "authorization_code",
          scope: "openid profile",
        }),
      }
    );

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    if (!access_token)
      return res.status(500).json({ error: "Failed to get access token." });

    const userResponse = await axios.get(
      "https://apis.roblox.com/oauth/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    const { sub, preferred_username, picture } = userResponse.data;

    let user = await User.findOne({ RobloxID: String(sub) });
    if (!user) {
      user = new User({
        RobloxID: sub,
        username: preferred_username,
        avatar: picture,
      });
      await user.save();
    }

    let updatedUserData = { _initalSetup: true };

    if (!existingUserData.orginPlatform) {
      updatedUserData.orginPlatform = {
        robloxID: sub,
        username: preferred_username,
        avatar: picture,
      };
    } else if (
      typeof existingUserData.orginPlatform === "object" &&
      existingUserData.orginPlatform.robloxID !== sub
    ) {
      if (
        !existingUserData.addedPlatform ||
        existingUserData.addedPlatform.robloxID !== sub
      ) {
        updatedUserData.addedPlatform = {
          robloxID: sub,
          username: preferred_username,
          avatar: picture,
        };
      }
      updatedUserData.orginPlatform = existingUserData.orginPlatform;
    }

    const newToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "5h",
    });

    res.cookie("jwt", newToken, {
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    });
    res.cookie(
      "userdata",
      encodeURIComponent(JSON.stringify(updatedUserData)),
      { sameSite: "Lax" }
    );

    res.json({ token: newToken, ReturnedUser: updatedUserData });
  } catch (error) {
    console.error("Auth Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/auth/discord/callback", async (req, res) => {
  const { code } = req.query;
  const userDataCookie = req.headers["___cookie"];

  if (!code) return res.status(400).json({ error: "Code not provided." });

  try {
    let existingUserData = {};
    if (userDataCookie) {
      try {
        existingUserData = JSON.parse(decodeURIComponent(userDataCookie));
      } catch (parseError) {
        console.error("Error parsing userCookie:", parseError);
      }
    }

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: process.env.REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    if (!access_token)
      return res.status(500).json({ error: "Failed to get access token." });

    const userResponse = await axios.get(
      "https://discord.com/api/v10/users/@me",
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    const { id: discordID, username, avatar } = userResponse.data;
    const avatarUrl = `https://cdn.discordapp.com/avatars/${discordID}/${avatar}.png`;

    let user = await User.findOne({ discordID: String(discordID) });
    if (!user) {
      user = new User({ discordID, username, avatar: avatarUrl });
      await user.save();
    }

    let updatedUserData = { _initalSetup: true };

    if (!existingUserData.orginPlatform) {
      updatedUserData.orginPlatform = {
        discordID,
        username,
        avatar: avatarUrl,
      };
    } else if (
      typeof existingUserData.orginPlatform === "object" &&
      existingUserData.orginPlatform.discordID !== discordID
    ) {
      if (
        !existingUserData.addedPlatform ||
        existingUserData.addedPlatform.discordID !== discordID
      ) {
        updatedUserData.addedPlatform = {
          discordID,
          username,
          avatar: avatarUrl,
        };
      }
      updatedUserData.orginPlatform = existingUserData.orginPlatform;
    }

    const newToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "5h",
    });

    res.cookie("jwt", newToken, {
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    });
    res.cookie(
      "userdata",
      encodeURIComponent(JSON.stringify(updatedUserData)),
      { sameSite: "Lax" }
    );

    res.json({ token: newToken, ReturnedUser: updatedUserData });
  } catch (error) {
    console.error("Auth Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/auth/discord/link", authenticateUser, async (req, res) => {
  const { discordId, username, avatar } = req.body;
  if (!discordId || !username) {
    return res.status(400).json({ error: "Missing Discord ID or Username." });
  }
  try {
    let user = await User.findOne({ discordID: discordId });
    if (!user) {
      user = new User({ discordID: discordId });
      await user.save();
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "5h",
    });
    res.cookie("jwt", token, {
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    });
    res.json({ message: "Discord account linked successfully.", token });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.delete("/api/auth/roblox/link", authenticateUser, async (req, res) => {
  try {
    if (!req.user.RobloxID) {
      return res
        .status(400)
        .json({ error: "No linked Roblox account to unlink." });
    }

    req.user.RobloxID = undefined;
    await req.user.save();

    res.clearCookie("roblox_user");

    res.json({ message: "Roblox account unlinked successfully." });
  } catch (error) {
    console.error("Error unlinking Roblox account:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/getRobloxUser/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const userName = await noblox.getUsernameFromId(id);
    const avatarData = await noblox.getPlayerThumbnail(
      id,
      420,
      "png",
      true,
      "Headshot"
    );

    if (!userName) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!avatarData || !avatarData.length || !avatarData[0].imageUrl) {
      return res.status(404).json({ error: "Avatar not found" });
    }

    const avatarUrl = avatarData[0].imageUrl;

    return res.json({ username: userName, avatar: avatarUrl });
  } catch (error) {
    console.error("Error fetching Roblox user data:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching Roblox user data." });
  }
});

app.get("/api/products/owned", authenticateUser, async (req, res) => {
  try {
    const allProducts = await Product.find();
    if (!allProducts || allProducts.length === 0) {
      return res
        .status(404)
        .json({ error: "No products found in the database" });
    }

    const ownedProductIDs = new Set(
      req.user.products.map((product) => product.productID)
    );

    const products = allProducts.map((product) => ({
      productName: product.productName,
      productDescription: product.productDescription,
      productPricing: product.productPricing,
      productIconUrl: product.productIconUrl,
      productID: product.productID,
      productDownloadUrl: product.productDownloadUrl || "#",
      owned: ownedProductIDs.has(product.productID),
    }));

    res.json({ products });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Server error" });
  }
});

console.log("KEKE3");
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port ${process.env.PORT || 3000}`);
});
