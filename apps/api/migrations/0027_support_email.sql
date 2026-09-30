-- 0027: the support e-mail shown on the contact page comes from the owner's settings (like the
-- WhatsApp number), so no address is shown before the domain's mailbox exists.
ALTER TABLE platform.settings
  ADD COLUMN support_email text CHECK (
    support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(support_email) <= 120
  );
