
import { sendTeamInvitationEmail } from "../auth/email-verification.js";

const ALLOWED_MEMBER_ROLES = ["admin", "responder", "viewer"];
const TEAM_MANAGEMENT_ROLES = ["owner", "admin"];

export function createTeamService(pool, repository, options = {}) {
  const sendInvitationEmail =
    options.sendInvitationEmail || sendTeamInvitationEmail;

  function httpError(status, code, message) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
  }

  async function requireTeamRole(teamId, userId, roles) {
    const team = await repository.findForUser(teamId, userId);

    if (!team) {
      throw httpError(404, "TEAM_NOT_FOUND", "Team not found");
    }

    if (!roles.includes(team.role)) {
      throw httpError(
        403,
        "INSUFFICIENT_TEAM_PERMISSIONS",
        "You do not have permission to manage this team"
      );
    }

    return team;
  }

  function validateMemberRole(role) {
    if (!ALLOWED_MEMBER_ROLES.includes(role)) {
      throw httpError(
        400,
        "INVALID_ROLE",
        "Role must be admin, responder, or viewer"
      );
    }
  }

  function validateEmail(email) {
    if (typeof email !== "string" || !email.trim()) {
      throw httpError(
        400,
        "INVALID_EMAIL",
        "A valid email address is required"
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      throw httpError(
        400,
        "INVALID_EMAIL",
        "Please provide a valid email address"
      );
    }

    return normalizedEmail;
  }

  return {
    async create(name, userId) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const team = await repository.create(client, name, userId);

        await repository.addMember(
          client,
          team.id,
          userId,
          "owner"
        );

        await client.query("COMMIT");

        return {
          ...team,
          role: "owner",
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async list(userId) {
      return repository.listForUser(userId);
    },

    async get(teamId, userId) {
      const team = await repository.findForUser(teamId, userId);

      if (!team) {
        throw httpError(404, "TEAM_NOT_FOUND", "Team not found");
      }

      return team;
    },

    async listMembers(teamId, userId) {
      await this.get(teamId, userId);

      return repository.listMembers(teamId);
    },

    async listInvitations(teamId, userId) {
      await requireTeamRole(
        teamId,
        userId,
        TEAM_MANAGEMENT_ROLES
      );

      return repository.listInvitations(teamId);
    },

    async cancelInvitation(teamId, actorId, invitationId) {
      await requireTeamRole(
        teamId,
        actorId,
        TEAM_MANAGEMENT_ROLES
      );

      const cancelled = await repository.cancelInvitation(
        teamId,
        invitationId
      );

      if (!cancelled) {
        throw httpError(
          404,
          "INVITATION_NOT_FOUND",
          "Invitation not found"
        );
      }

      return {
        cancelled: true,
        invitationId,
      };
    },

    async addMember(teamId, actorId, email, role) {
      const team = await requireTeamRole(
        teamId,
        actorId,
        TEAM_MANAGEMENT_ROLES
      );

      const normalizedEmail = validateEmail(email);

      validateMemberRole(role);

      if (role === "admin" && team.role !== "owner") {
        throw httpError(
          403,
          "INSUFFICIENT_TEAM_PERMISSIONS",
          "Only the owner can add an admin"
        );
      }

      const user =
        await repository.findVerifiedUserByEmail(normalizedEmail);

      // Existing verified user: add directly to the team.
      if (user) {
        const members = await repository.listMembers(teamId);

        const alreadyMember = members.some(
          (member) => String(member.user_id) === String(user.id)
        );

        if (alreadyMember) {
          throw httpError(
            409,
            "MEMBER_ALREADY_EXISTS",
            "This user is already a team member"
          );
        }

        try {
          return await repository.addMembership(
            teamId,
            user.id,
            role
          );
        } catch (error) {
          if (error.code === "23505") {
            throw httpError(
              409,
              "MEMBER_ALREADY_EXISTS",
              "This user is already a team member"
            );
          }

          throw error;
        }
      }

      // Unregistered or unverified user: create/update invitation.
      const invitation = await repository.createInvitation(
        teamId,
        normalizedEmail,
        role,
        actorId
      );

      try {
        // The second argument is the team name, not the actor's name.
        await sendInvitationEmail(
          normalizedEmail,
          team.name,
          role
        );
      } catch (error) {
        // Keep the invitation record so it can be retried.
        // Do not log recipient email, tokens, or verification codes.
        console.error("Team invitation email delivery failed", {
          teamId,
          invitationId: invitation.id,
          code: error.code,
          status: error.status,
          message: error.message,
        });

        throw httpError(
          502,
          "INVITATION_EMAIL_FAILED",
          "Invitation email could not be delivered. Check the email provider configuration and retry."
        );
      }

      return {
        ...invitation,
        invitationPending: true,
      };
    },

    async updateMemberRole(teamId, actorId, targetId, role) {
      await requireTeamRole(teamId, actorId, ["owner"]);

      validateMemberRole(role);

      if (String(actorId) === String(targetId)) {
        throw httpError(
          400,
          "CANNOT_CHANGE_OWN_ROLE",
          "You cannot change your own role"
        );
      }

      const member = await repository.updateMemberRole(
        teamId,
        targetId,
        role
      );

      if (!member) {
        throw httpError(
          404,
          "MEMBER_NOT_FOUND",
          "Member not found or owner role is protected"
        );
      }

      return member;
    },

    async removeMember(teamId, actorId, targetId) {
      const actor = await requireTeamRole(
        teamId,
        actorId,
        TEAM_MANAGEMENT_ROLES
      );

      if (String(actorId) === String(targetId)) {
        throw httpError(
          400,
          "CANNOT_REMOVE_SELF",
          "You cannot remove yourself using this endpoint"
        );
      }

      const members = await repository.listMembers(teamId);

      const target = members.find(
        (member) => String(member.user_id) === String(targetId)
      );

      if (!target) {
        throw httpError(
          404,
          "MEMBER_NOT_FOUND",
          "Member not found"
        );
      }

      if (target.role === "owner") {
        throw httpError(
          403,
          "OWNER_PROTECTED",
          "The workspace owner cannot be removed"
        );
      }

      if (target.role === "admin" && actor.role !== "owner") {
        throw httpError(
          403,
          "INSUFFICIENT_TEAM_PERMISSIONS",
          "Only the owner can remove an admin"
        );
      }

      await repository.removeMember(teamId, targetId);

      return {
        removed: true,
        userId: targetId,
      };
    },

    async requireWebhookSecretPermission(teamId, userId) {
      return requireTeamRole(
        teamId,
        userId,
        TEAM_MANAGEMENT_ROLES
      );
    },
  };
}
