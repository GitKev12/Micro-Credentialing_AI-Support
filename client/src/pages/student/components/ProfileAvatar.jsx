import { useState } from "react";
import { getInitials } from "../../../services/avatar";

function ProfileAvatar({ src, name, size = 44 }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className="profile-avatar"
      style={{ width: size, height: size }}
      title={name || "Profile"}
    >
      {showImage ? (
        <img
          src={src}
          alt={name ? `${name}'s profile photo` : "Profile photo"}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="profile-avatar__initials" aria-hidden="true">
          {getInitials(name)}
        </span>
      )}
    </span>
  );
}

export default ProfileAvatar;
