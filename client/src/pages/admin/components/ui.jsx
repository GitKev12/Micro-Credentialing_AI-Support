/**
 * The admin console's shared controls.
 *
 * This file was all of them at once — ten components and 533 lines, so any one
 * of them was found by scrolling. Each lives in its own module beside this one
 * now; this stays as the front door so every `from "./components/ui"` in the
 * console keeps working and nothing had to be rewritten to gain the split.
 */
export { PageHeader, SectionTitle, AdminButton, BackLink, StatTile, Avatar } from "./ui/primitives";
export { SearchField } from "./ui/SearchField";
export { AdminSelect } from "./ui/AdminSelect";
export { AdminField } from "./ui/AdminField";
export { AdminModal } from "./ui/AdminModal";
export { ConfirmDeleteModal } from "./ui/ConfirmDeleteModal";
