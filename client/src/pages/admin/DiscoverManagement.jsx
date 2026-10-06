import { useEffect, useMemo, useState } from "react";
import { fetchDiscoverClasses, setDiscoverSettings, acceptRequest, declineRequest } from "../../services/discover";
import { DiscoverIcon } from "./components/icons";
import { AdminButton, PageHeader, SearchField } from "./components/ui";
import { AdminSelect } from "./components/ui/AdminSelect";
import { useNotice } from "../../lib/useNotice";
import { SkeletonTable } from "../../components/Skeleton";

const OPTIONS = [
  { value: "approval", label: "Needs approval" },
  { value: "open", label: "Open" }
];
const textOf = (cls) => `${cls.name} ${cls.course?.code ?? ""} ${cls.course?.title ?? ""} ${cls.assessor ?? ""}`.toLowerCase();

export default function DiscoverManagement() {
  const [classes, setClasses] = useState([]), [status, setStatus] = useState("loading");
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(null);
  const [notice, setNotice] = useNotice();
  useEffect(() => { let on = true; fetchDiscoverClasses().then((rows) => { if (on) { setClasses(rows); setStatus("ready"); } }).catch(() => { if (on) setStatus("error"); }); return () => { on = false; }; }, []);
  const rows = useMemo(() => classes.filter((cls) => textOf(cls).includes(query.trim().toLowerCase())), [classes, query]);
  const requests = classes.flatMap((cls) => (cls.requests ?? []).map((r) => ({ ...r, classId: cls.id, className: cls.name, course: cls.course?.code ?? "" })));
  const replace = (next) => setClasses((list) => list.map((cls) => cls.id === next.id ? next : cls));
  async function save(cls, data) {
    setBusy(cls.id);
    try { const next = await setDiscoverSettings(cls.id, data); replace(next); setNotice({ tone: "ok", text: `${cls.name} was updated.` }); }
    catch (err) { setNotice({ tone: "error", text: err.response?.data?.message || "Couldn't update Discover." }); }
    finally { setBusy(null); }
  }
  async function answer(cls, request, accept) {
    const key = `${cls.id}:${request.studentId}`; setBusy(key);
    try { const next = await (accept ? acceptRequest : declineRequest)(cls.id, request.studentId); replace(next); setNotice({ tone: "ok", text: accept ? `${request.name} was enrolled.` : `${request.name}'s request was declined.` }); }
    catch (err) { setNotice({ tone: "error", text: err.response?.data?.message || "Couldn't update the request." }); }
    finally { setBusy(null); }
  }

  return <div className="admin-main__inner admin-discover">
    <PageHeader title="Discover" icon={DiscoverIcon} />
    <SearchField value={query} onChange={setQuery} placeholder="Search classes" hint={`${rows.length} matched`} notice={notice} />
    {status === "loading" ? <SkeletonTable rows={5} cols={7} label="Loading Discover classes…" /> : status === "error" ? <p className="admin-notice admin-notice--error">Couldn't load Discover.</p> : <div className="admin-table-card">
      <table className="admin-table">
        <thead><tr><th>Class</th><th>Course</th><th>Assessor</th><th>Students</th><th>Posted</th><th>Enrollment</th><th>Requests</th></tr></thead>
        <tbody>{rows.map((cls) => <tr key={cls.id} className={!cls.active ? "is-inactive" : ""}>
          <td><strong>{cls.name}</strong>{cls.mode === "assessOnly" ? <span className="admin-pathway-tag admin-pathway-tag--assess">Assess-only</span> : null}</td>
          <td>{cls.course ? <><strong>{cls.course.code}</strong><span className="admin-cell__sub">{cls.course.title}</span></> : "—"}</td>
          <td>{cls.assessor ?? "—"}</td><td>{cls.studentCount}</td>
          <td><button type="button" className={`admin-switch${cls.posted ? " is-on" : ""}`} role="switch" aria-checked={cls.posted} disabled={Boolean(busy) || (!cls.posted && cls.refusal)} title={cls.refusal || (cls.posted ? `Unpost ${cls.name}` : `Post ${cls.name}`)} onClick={() => save(cls, { posted: !cls.posted })}><span className="admin-switch__track"><span className="admin-switch__thumb" /></span><span className="admin-switch__label">{cls.posted ? "Posted" : "Not posted"}</span></button></td>
          <td><AdminSelect label={`${cls.name} enrollment`} value={cls.enrollment} options={OPTIONS} disabled={Boolean(busy)} onChange={(value) => save(cls, { enrollment: value })} /></td>
          <td>{cls.posted ? cls.requests.length : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    <section className="admin-discover__requests admin-table-card" aria-labelledby="discover-requests">
      <h2 id="discover-requests" className="admin-card__title">Requests</h2>
      {requests.length === 0 ? <p className="admin-empty-note">No requests waiting.</p> : <table className="admin-table"><thead><tr><th>Student</th><th>Class</th><th aria-label="Actions" /></tr></thead><tbody>{requests.map((request) => { const cls = classes.find((row) => row.id === request.classId); const key = `${request.classId}:${request.studentId}`; return <tr key={key}><td><strong>{request.name}</strong><span className="admin-cell__sub">{request.studentNumber}</span></td><td>{request.course} — {request.className}</td><td className="admin-table__actions"><AdminButton disabled={Boolean(busy)} onClick={() => answer(cls, request, true)}>Accept</AdminButton><AdminButton variant="admin-btn--compact" disabled={Boolean(busy)} onClick={() => answer(cls, request, false)}>Decline</AdminButton></td></tr>; })}</tbody></table>}
    </section>
  </div>;
}
