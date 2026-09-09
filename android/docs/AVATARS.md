# Conversation avatars

The original file supplied by the user is stored byte-for-byte as app/src/main/assets/avatar-sheet.png (SHA-256 03034a4a769df7fe529d54ad4f561e4366d1cb785394596d886b8084b000287a).

The Conversation UI displays only the supplied circular SAYO and Nurse Robo Type T regions. User messages are right-aligned bubbles and do not render an avatar, avatar placeholder, or reserved avatar column. The full sheet is decoded once by WebView and reused as a CSS sprite.
