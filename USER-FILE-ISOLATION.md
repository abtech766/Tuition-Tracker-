# Strict per-user GitHub storage model

## Privacy rule

A user never receives the GitHub token and never reads GitHub directly. The browser sends
only its Supabase Auth access token to Render. Render verifies the token and derives the
user UUID from it. Every GitHub read/write is then scoped by that UUID.

## File layout

```text
.tuition/registry.json          # repository pool; no user application data
.tuition/user-index.json        # uid -> repository/path lookup; server-only metadata
users/<user-uuid>.json          # one private application-data file per user
classes/<class-uuid>.json       # minimal server index for join-code lookup and ACL
files/<user-uuid>/<path>.json   # optional user-owned file metadata
```

A user file contains only that user's owned data and authorized projections:

```json
{
  "profile": {},
  "students": [],
  "owned_classes": [],
  "joined_classes": [],
  "enrollments": [],
  "attendance": [],
  "homework": [],
  "notifications": []
}
```

## How class sharing works without exposing users

A teacher owns the canonical class record in the teacher file. When a parent joins using
the class code, the backend validates the code and writes:

1. an enrollment and read-only class projection into the parent's file;
2. an enrollment/student projection into the teacher's file;
3. a server-side ACL entry in the class index.

The parent never receives the teacher's file. The teacher never receives the parent's
full file. Edits to a class are written to the teacher-owned canonical record and the
backend refreshes only authorized projections. Attendance and homework are returned only
to the teacher or enrolled parents.

## Required backend enforcement

- Every query must receive the authenticated `uid` from the verified JWT; client-supplied
  `uid`, email and filename values are ignored.
- Profile, student and notification reads are owner-only.
- Class reads are owner or enrolled-member reads.
- Class mutations are teacher-owner-only.
- Enrollment mutations are parent-owner or teacher-owner actions.
- Attendance/homework reads require class membership; writes require the teacher owner.
- Account deletion removes the user's file, owned class projections, ACL references and
  then deletes the Supabase Auth identity through the server-only service key.
- GitHub repository names, paths and SHAs are never returned to the browser.

## Important implementation boundary

GitHub itself cannot enforce different permissions for different JSON files inside one
private repository. The isolation boundary is therefore the Render backend. Direct GitHub
access must remain limited to the backend token, and the backend must never expose raw
repository URLs or file contents outside an authorized API response.
