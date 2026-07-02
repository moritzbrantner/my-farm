# Storage Upgrade Tiers Are Explicit State

Storage Upgrade progress is stored as explicit Silo and Barn tier fields instead of being inferred from capacity. Capacity already exists on the save, but explicit tiers make catalog-driven upgrade rules, max-tier checks, UI labels, and future balancing changes clearer while preserving compatibility through default tier values on older saves.
