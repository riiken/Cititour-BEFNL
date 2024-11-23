const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI,{
      useNewUrlParser: true,
      useUnifiedTopology: true,
      authMechanism: 'DEFAULT', // Or 'SCRAM-SHA-1' if using older MongoDB
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
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