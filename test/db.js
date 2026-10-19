const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongo;

const connect = async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
};

const clear = async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

const close = async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
};

module.exports = { connect, clear, close };
