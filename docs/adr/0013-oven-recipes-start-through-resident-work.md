# Oven Recipes Start Through Resident Work

Oven recipe queueing now creates a pending Oven job and a Resident Task instead of starting the timed bake instantly. Ingredients and queue capacity are reserved immediately so Commands stay deterministic and resource races are avoided, while baking starts only after the assigned Farm Resident completes the Start Oven Recipe step at the Kitchen Oven Workstation. This keeps prior inventory safety while making Farmhouse kitchen work visible.
