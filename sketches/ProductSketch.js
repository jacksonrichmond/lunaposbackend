const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
    },
    productDescription: {
      type: String,
      required: true,
    },
    productPricing: {
      usd: {
        type: Number,
        default: 0,
      },
      robux: {
        type: Number,
        default: 0,
      },
    },
    productIconUrl: {
      type: String,
      default: "",
    },
    productID: {
      type: String,
      required: true,
      unique: true,
    },
    productDownloadUrl: {
      type: String,
      default: "",
    },
  },
  { timestamps: true, collection: "Products" } 
);

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
