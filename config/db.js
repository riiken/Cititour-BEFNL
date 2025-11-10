const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Remove deprecated options - not needed in MongoDB Driver v4+
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
// const connectDB = async () => {
//   try {
//       await mongoose.connect(process.env.MONGO_DB_URL)
//       console.log("Connect to MongoDB successfully")
//   } catch (error) {
//       console.log("Connect failed " + error.message )
//   }
// }