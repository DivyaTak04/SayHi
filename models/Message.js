const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    name: String,
    msg: String,
    timestamp: String,
    to: String,        // recipient username
    from: String,      // sender username
    isPrivate: Boolean // true for private messages
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
