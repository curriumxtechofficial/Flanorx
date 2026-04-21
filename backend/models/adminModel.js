import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminSchema = mongoose.Schema({
    name:       { type: String, required: true },
    email:      { type: String, required: true, unique: true },
    password:   { type: String, required: true },
    profile:    { type: String, default: '' },
    role:       { type: String, enum: ['superadmin', 'admin'], default: 'admin' },
    googleId:   { type: String },
    isVerified: { type: Boolean, default: false },
    authMethod: { type: String, enum: ['local', 'google'], default: 'local' },
    date:       { type: Date, default: Date.now },
}, { timestamps: true });

adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(7);
    this.password = await bcrypt.hash(this.password, salt);
});

adminSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;