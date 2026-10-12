import nodemailer from "nodemailer";
import { config, isEmailConfigured } from "./config.js";

export async function sendEmail(input: {
  subject: string;
  text: string;
}): Promise<void> {
  if (!isEmailConfigured()) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });

  await transporter.sendMail({
    from: config.smtp.from,
    to: config.visaDigestEmail,
    subject: input.subject,
    text: input.text,
  });
}
