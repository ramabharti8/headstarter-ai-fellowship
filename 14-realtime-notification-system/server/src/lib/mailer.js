const nodemailer = require("nodemailer");

let transporter = null;
let usingConsoleTransport = false;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else {
    // No SMTP configured: log emails to the console instead of failing. Lets the
    // "email channel" feature be demoed/tested with zero external dependencies.
    usingConsoleTransport = true;
    transporter = {
      sendMail: async (options) => {
        console.log("\n[email:console-transport] ---------------------------------");
        console.log(`To:      ${options.to}`);
        console.log(`Subject: ${options.subject}`);
        console.log(`Body:    ${options.text}`);
        console.log("-----------------------------------------------------------\n");
        return { messageId: `console-${Date.now()}` };
      },
    };
  }
  return transporter;
}

async function sendNotificationEmail({ to, title, message }) {
  const mailer = getTransporter();
  return mailer.sendMail({
    from: process.env.SMTP_FROM || "SignalBox <notifications@example.com>",
    to,
    subject: title,
    text: message,
  });
}

module.exports = { sendNotificationEmail, isConsoleTransport: () => usingConsoleTransport };
