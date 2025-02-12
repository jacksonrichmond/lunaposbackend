const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    products: [
      {
        type: String,
        required: false,
      },
    ],
    blacklisted: {
      type: Boolean,
      default: false,
    },
    RobloxID: {
      type: String,
      required: false,
    },
    discordID: {
      type: String,
      required: false,
    },
  },
  { collection: "Database" }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
