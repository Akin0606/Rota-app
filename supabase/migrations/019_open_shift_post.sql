-- Lets a manager post an uncovered/under-staffed slot as claimable by anyone,
-- without first assigning it to a specific person. rota_assignments.staff_id
-- is already nullable; this just adds an optional role filter for the post.
alter table rota_assignments
    add column if not exists required_role text;
