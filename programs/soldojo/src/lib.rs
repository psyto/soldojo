use anchor_lang::prelude::*;

declare_id!("CzTcLkeLZvk77ZJQpaL5fCYVgxqU63JV8rZBwC1kQ3rQ");

#[program]
pub mod soldojo {
    use super::*;

    /// Initialize a learner profile PDA. Called once per user.
    pub fn init_profile(ctx: Context<InitProfile>) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.authority = ctx.accounts.authority.key();
        profile.courses_completed = 0;
        profile.total_xp = 0;
        profile.bump = ctx.bumps.profile;
        msg!("Profile initialized for {}", ctx.accounts.authority.key());
        Ok(())
    }

    /// Record a course completion on-chain. Creates a completion PDA
    /// and increments the learner profile counters.
    pub fn record_completion(
        ctx: Context<RecordCompletion>,
        course_slug: String,
        xp_earned: u32,
    ) -> Result<()> {
        require!(course_slug.len() <= 32, SolDojoError::SlugTooLong);
        require!(xp_earned <= 10_000, SolDojoError::XPTooHigh);

        let completion = &mut ctx.accounts.completion;
        completion.authority = ctx.accounts.authority.key();
        completion.course_slug = course_slug.clone();
        completion.xp_earned = xp_earned;
        completion.completed_at = Clock::get()?.unix_timestamp;
        completion.bump = ctx.bumps.completion;

        let profile = &mut ctx.accounts.profile;
        profile.courses_completed = profile.courses_completed.checked_add(1).unwrap();
        profile.total_xp = profile.total_xp.checked_add(xp_earned as u64).unwrap();

        msg!(
            "Course '{}' completed by {} — +{} XP (total: {})",
            course_slug,
            ctx.accounts.authority.key(),
            xp_earned,
            profile.total_xp
        );

        Ok(())
    }
}

// ── Accounts ──────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitProfile<'info> {
    #[account(
        init,
        payer = authority,
        space = LearnerProfile::SIZE,
        seeds = [b"profile", authority.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, LearnerProfile>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(course_slug: String)]
pub struct RecordCompletion<'info> {
    #[account(
        init,
        payer = authority,
        space = CourseCompletion::size(&course_slug),
        seeds = [b"completion", authority.key().as_ref(), course_slug.as_bytes()],
        bump
    )]
    pub completion: Account<'info, CourseCompletion>,

    #[account(
        mut,
        seeds = [b"profile", authority.key().as_ref()],
        bump = profile.bump,
        has_one = authority
    )]
    pub profile: Account<'info, LearnerProfile>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ── State ─────────────────────────────────────────────────

#[account]
pub struct LearnerProfile {
    pub authority: Pubkey,       // 32
    pub courses_completed: u32,  // 4
    pub total_xp: u64,          // 8
    pub bump: u8,                // 1
}

impl LearnerProfile {
    pub const SIZE: usize = 8 + 32 + 4 + 8 + 1;
}

#[account]
pub struct CourseCompletion {
    pub authority: Pubkey,       // 32
    pub course_slug: String,     // 4 + len
    pub xp_earned: u32,          // 4
    pub completed_at: i64,       // 8
    pub bump: u8,                // 1
}

impl CourseCompletion {
    pub fn size(slug: &str) -> usize {
        8 + 32 + (4 + slug.len()) + 4 + 8 + 1
    }
}

// ── Errors ────────────────────────────────────────────────

#[error_code]
pub enum SolDojoError {
    #[msg("Course slug must be 32 characters or fewer")]
    SlugTooLong,
    #[msg("XP reward exceeds maximum allowed")]
    XPTooHigh,
}
