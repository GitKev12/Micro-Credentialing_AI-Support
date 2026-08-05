import { useEffect, useState } from "react";
import StudentSidebar from "./components/StudentSidebar";
import Certifications from "./components/Certifications";
import Badges from "./components/Badges";
import { getStoredSession } from "../../auth/services/authService";
import { fetchStudentAchievements } from "../../services/achievements";

/**
 * The Certification and Badges tabs.
 *
 * One component serves both because they are one request and one shell — the
 * rail on the left is the tab strip, so a tab is a route rather than local
 * state and the browser's back button keeps working. Only the panel differs,
 * which is also why the rail summary is written per view: the numbers beside
 * the nav should describe the tab you are looking at.
 */
function AchievementsPage({ view }) {
  const [certifications, setCertifications] = useState([]);
  const [badges, setBadges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const student = getStoredSession()?.user;

  useEffect(() => {
    let active = true;

    fetchStudentAchievements(student?.id)
      .then((data) => {
        if (!active) return;
        setCertifications(data.certifications);
        setBadges(data.badges);
      })
      .catch(() => {
        if (!active) return;
        setCertifications([]);
        setBadges([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
    // The session id is read once on mount; it cannot change without a re-login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBadges = view === "badges";

  const summary = isLoading
    ? []
    : isBadges
      ? [
          { label: "Earned", value: badges.filter((badge) => badge.earned).length },
          { label: "Available", value: badges.length }
        ]
      : [
          {
            label: "Issued",
            value: certifications.filter((entry) => entry.status === "issued").length
          },
          {
            label: "Awaiting",
            value: certifications.filter((entry) => entry.status === "pending").length
          }
        ];

  return (
    <div className="sd-body">
      <StudentSidebar summary={summary} />

      <main className="sd-main">
        {isLoading ? (
          <>
            <div className="sd-skeleton sd-skeleton--hero" aria-hidden="true" />
            <p className="sd-sr-only" role="status">
              Loading your {isBadges ? "badges" : "certifications"}…
            </p>
          </>
        ) : isBadges ? (
          <Badges badges={badges} />
        ) : (
          <Certifications certifications={certifications} />
        )}
      </main>
    </div>
  );
}

export default AchievementsPage;
