const User = require('../model/User');
const { sendMailSafe, appUrl, adminEmails } = require('../config/mailer');

/**
 * Listing lifecycle emails. All are fire-and-forget: callers don't await
 * them, and failures are only logged.
 */

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const layout = (title, bodyHtml) => `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#212529">
  <h2 style="color:#86B817;margin-bottom:4px">CitiTour</h2>
  <h3 style="margin-top:0">${escapeHtml(title)}</h3>
  ${bodyHtml}
  <p style="color:#868e96;font-size:12px;margin-top:24px">You're receiving this because you listed a business on CitiTour.</p>
</div>`;

const button = (href, label) =>
  `<p><a href="${href}" style="background:#86B817;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(label)}</a></p>`;

const ownerOf = async (listing) => User.findById(listing.ownerId).select('name email').lean();

const notifyAdminsNewListing = (listing) => {
  const to = adminEmails().join(',');
  const link = `${appUrl()}/admin`;
  return sendMailSafe({
    to,
    subject: `New listing to review: ${listing.name} (${listing.city})`,
    text: `${listing.name} (${listing.type}) in ${listing.city} is waiting for review.\n\nReview it: ${link}`,
    html: layout('New listing to review', `
      <p><strong>${escapeHtml(listing.name)}</strong> · ${escapeHtml(listing.type)} · ${escapeHtml(listing.city)}</p>
      ${button(link, 'Open review queue')}`)
  });
};

const notifyOwnerApproved = async (listing) => {
  const owner = await ownerOf(listing);
  if (!owner) return false;
  const page = `${appUrl()}/place/${listing._id}`;
  return sendMailSafe({
    to: owner.email,
    subject: `${listing.name} is now live on CitiTour`,
    text: `Hi ${owner.name},\n\n${listing.name} is approved and can now appear in trip plans for ${listing.city}.\n\nYour public page: ${page}\nShare it on WhatsApp, Instagram and Google Business to get more enquiries.\n\nTeam CitiTour`,
    html: layout(`${listing.name} is live`, `
      <p>Hi ${escapeHtml(owner.name)},</p>
      <p>Your listing is approved. Travellers planning trips to <strong>${escapeHtml(listing.city)}</strong> can now see it and contact you directly.</p>
      ${button(page, 'View your public page')}
      <p><strong>Get more enquiries:</strong> share your page link on WhatsApp status, Instagram bio and your Google Business profile.</p>`)
  });
};

const notifyOwnerRejected = async (listing) => {
  const owner = await ownerOf(listing);
  if (!owner) return false;
  const edit = `${appUrl()}/partner/edit/${listing._id}`;
  return sendMailSafe({
    to: owner.email,
    subject: `Please update your listing: ${listing.name}`,
    text: `Hi ${owner.name},\n\nWe couldn't publish ${listing.name} yet.\n\nWhat to fix: ${listing.rejectionReason}\n\nEdit your listing: ${edit}\n\nTeam CitiTour`,
    html: layout('Your listing needs a small change', `
      <p>Hi ${escapeHtml(owner.name)},</p>
      <p>We couldn't publish <strong>${escapeHtml(listing.name)}</strong> yet.</p>
      <p style="background:#fff3bf;padding:10px;border-radius:6px"><strong>What to fix:</strong> ${escapeHtml(listing.rejectionReason)}</p>
      ${button(edit, 'Edit your listing')}`)
  });
};

module.exports = { notifyAdminsNewListing, notifyOwnerApproved, notifyOwnerRejected, escapeHtml };
