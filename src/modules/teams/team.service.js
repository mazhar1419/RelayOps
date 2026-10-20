import { sendTeamInvitationEmail } from "../auth/email-verification.js";

export function createTeamService(pool, repository, options = {}) {
  const sendInvitationEmail = options.sendInvitationEmail || sendTeamInvitationEmail;
  function httpError(status, code, message) {
    const error = new Error(message); error.status = status; error.code = code; return error;
  }
  async function requireTeamRole(teamId, userId, roles) {
    const team = await repository.findForUser(teamId, userId);
    if (!team) throw httpError(404, "TEAM_NOT_FOUND", "Team not found");
    if (!roles.includes(team.role)) throw httpError(403, "INSUFFICIENT_TEAM_PERMISSIONS", "You do not have permission to manage team members");
    return team;
  }
  return {
    async create(name, userId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const team = await repository.create(client, name, userId);
        await repository.addMember(client, team.id, userId, "owner");
        await client.query("COMMIT");
        return { ...team, role: "owner" };
      } catch (error) {
        await client.query("ROLLBACK"); throw error;
      } finally { client.release(); }
    },
    async list(userId) { return repository.listForUser(userId); },
    async get(teamId, userId) {
      const team = await repository.findForUser(teamId, userId);
      if (!team) throw httpError(404, "TEAM_NOT_FOUND", "Team not found");
      return team;
    },
    async listMembers(teamId, userId) {
      await this.get(teamId, userId);
      return repository.listMembers(teamId);
    },
    async listInvitations(teamId, userId) {
      await requireTeamRole(teamId, userId, ["owner", "admin"]);
      return repository.listInvitations(teamId);
    },
    async cancelInvitation(teamId, actorId, invitationId) {
      await requireTeamRole(teamId, actorId, ["owner", "admin"]);
      const cancelled = await repository.cancelInvitation(teamId, invitationId);
      if (!cancelled) throw httpError(404, "INVITATION_NOT_FOUND", "Invitation not found");
      return { cancelled: true, invitationId };
    },
    async addMember(teamId, actorId, email, role) {
      const actor = await requireTeamRole(teamId, actorId, ["owner", "admin"]);
      if (role === "admin" && actor.role !== "owner") throw httpError(403, "INSUFFICIENT_TEAM_PERMISSIONS", "Only the owner can add an admin");
      const normalizedEmail = email.toLowerCase();
      const user = await repository.findVerifiedUserByEmail(normalizedEmail);
      if (!user) {
        const invitation = await repository.createInvitation(teamId, normalizedEmail, role, actorId);
        try {
          await sendInvitationEmail(normalizedEmail, actor.name, role);
        } catch (error) {
          error.message = "Invitation saved, but the email could not be delivered. Check Resend configuration and retry adding this email.";
          throw error;
        }
        return { ...invitation, invitationPending: true };
      }
      try { return await repository.addMembership(teamId, user.id, role); }
      catch (error) {
        if (error.code === "23505") throw httpError(409, "MEMBER_ALREADY_EXISTS", "This user is already a workspace member");
        throw error;
      }
    },
    async updateMemberRole(teamId, actorId, targetId, role) {
      await requireTeamRole(teamId, actorId, ["owner"]);
      if (String(actorId) === String(targetId)) throw httpError(400, "CANNOT_CHANGE_OWN_ROLE", "You cannot change your own role");
      const member = await repository.updateMemberRole(teamId, targetId, role);
      if (!member) throw httpError(404, "MEMBER_NOT_FOUND", "Member not found or owner role is protected");
      return member;
    },
    async removeMember(teamId, actorId, targetId) {
      const actor = await requireTeamRole(teamId, actorId, ["owner", "admin"]);
      if (String(actorId) === String(targetId)) throw httpError(400, "CANNOT_REMOVE_SELF", "Use account or workspace management to leave; owners cannot remove themselves here");
      const members = await repository.listMembers(teamId);
      const target = members.find((item) => String(item.user_id) === String(targetId));
      if (!target) throw httpError(404, "MEMBER_NOT_FOUND", "Member not found");
      if (target.role === "owner") throw httpError(403, "OWNER_PROTECTED", "The workspace owner cannot be removed");
      if (target.role === "admin" && actor.role !== "owner") throw httpError(403, "INSUFFICIENT_TEAM_PERMISSIONS", "Only the owner can remove an admin");
      await repository.removeMember(teamId, targetId);
      return { removed: true, userId: targetId };
    },
    async requireWebhookSecretPermission(teamId, userId) {
      const team = await repository.findForUser(teamId, userId);
      if (!team) throw httpError(404, "TEAM_NOT_FOUND", "Team not found");
      if (!["owner", "admin"].includes(team.role)) throw httpError(403, "INSUFFICIENT_TEAM_PERMISSIONS", "You do not have permission to manage webhook secrets");
      return team;
    },
  };
}
