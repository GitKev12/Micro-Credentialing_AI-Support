import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    studentNumber: {
      type: String,
      required: true,
      trim: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    program: {
      type: String,
      required: true,
      trim: true
    },
    yearLevel: {
      type: Number,
      min: 1,
      max: 6
    },
    adviserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Professor",
      default: null
    }
  },
  {
    timestamps: true
  }
);

const Student = mongoose.models.Student || mongoose.model("Student", studentSchema);

export default Student;
