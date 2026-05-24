import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    employeeNumber: {
      type: String,
      required: true,
      trim: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    office: {
      type: String,
      required: true,
      trim: true
    },
    permissions: {
      type: [String],
      default: []
    },
    canManageSchedules: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

const Admin = mongoose.models.Admin || mongoose.model("Admin", adminSchema);

export default Admin;
