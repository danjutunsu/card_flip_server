const mongoosedb = require('mongoose');

const questionSchema = new mongoosedb.Schema({
  question: {
    type: String,
    required: true
  },
  options: {
    type: [String],
    required: true
  },
  answer: {
    type: Number,
    required: true
  }
});

module.exports = mongoosedb.model('Question', questionSchema);
