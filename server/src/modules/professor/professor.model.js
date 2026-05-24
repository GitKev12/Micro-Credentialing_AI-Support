import mongoose from "mongoose";

const professorSchema = new mongoose.Schema(
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
    department: {
      type: String,
      required: true,
      trim: true
    },
    specialization: {
      type: [String],
      default: []
    },
    advisoryCapacity: {
      type: Number,
      min: 0,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

const Professor = mongoose.models.Professor || mongoose.model("Professor", professorSchema);

export default Professor;
