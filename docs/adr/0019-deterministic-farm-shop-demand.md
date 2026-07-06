# Deterministic Farm Shop Demand

Farm Shop Customer Visits use probabilistic demand for custom Shop Prices, but the roll is derived from saved Farm state instead of runtime randomness. This keeps visits reproducible across save reloads, server restarts, and tests while still letting higher Shop Prices reduce the chance of a Shop Sale.
