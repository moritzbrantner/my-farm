use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ItemStack {
    pub item_id: String,
    pub quantity: u32,
}

impl ItemStack {
    pub fn new(item_id: impl Into<String>, quantity: u32) -> Self {
        Self {
            item_id: item_id.into(),
            quantity,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ItemKind {
    Crop,
    Feed,
    AnimalProduct,
    Product,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ItemDef {
    pub id: String,
    pub name: String,
    pub kind: ItemKind,
    pub unlock_level: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct CropDef {
    pub item_id: String,
    pub reference_seconds: u32,
    pub harvest_quantity: u32,
    pub xp: u32,
    pub unlock_level: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum MachineKind {
    Bakery,
    FeedMill,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ShelterKind {
    ChickenCoop,
    CowPasture,
}

#[derive(
    Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq, PartialOrd, Ord,
)]
#[serde(rename_all = "snake_case")]
pub enum StorageKind {
    Silo,
    Barn,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StructureKind {
    Silo,
    Barn,
    Bakery,
    FeedMill,
    ChickenCoop,
    CowPasture,
    DeliveryBoard,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct RecipeDef {
    pub id: String,
    pub name: String,
    pub machine_kind: MachineKind,
    pub inputs: Vec<ItemStack>,
    pub outputs: Vec<ItemStack>,
    pub reference_seconds: u32,
    pub xp: u32,
    pub unlock_level: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct MachineDef {
    pub kind: MachineKind,
    pub name: String,
    pub build_cost: u32,
    pub unlock_level: u32,
    pub queue_limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ShelterDef {
    pub kind: ShelterKind,
    pub name: String,
    pub animal_name: String,
    pub build_cost: u32,
    pub unlock_level: u32,
    pub slots: usize,
    pub feed_item_id: String,
    pub product_item_id: String,
    pub reference_seconds: u32,
    pub xp: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct MarketItemDef {
    pub item_id: String,
    pub buy_price: Option<u32>,
    pub sell_price: Option<u32>,
    pub unlock_level: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct StorageUpgradeDef {
    pub storage_kind: StorageKind,
    pub tier: u32,
    pub unlock_level: u32,
    pub cost_coins: u32,
    pub capacity: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct BalanceConfig {
    pub time_scale: u32,
    pub max_orders: usize,
}

impl Default for BalanceConfig {
    fn default() -> Self {
        Self {
            time_scale: 10,
            max_orders: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct CatalogDocument {
    pub balance: BalanceConfig,
    pub items: Vec<ItemDef>,
    pub crops: Vec<CropDef>,
    pub recipes: Vec<RecipeDef>,
    pub machines: Vec<MachineDef>,
    pub shelters: Vec<ShelterDef>,
    pub market_items: Vec<MarketItemDef>,
    pub storage_upgrades: Vec<StorageUpgradeDef>,
    pub level_xp: Vec<u32>,
}

impl CatalogDocument {
    pub fn default_catalog() -> Self {
        Self {
            balance: BalanceConfig::default(),
            items: vec![
                item("wheat", "Wheat", ItemKind::Crop, 1),
                item("corn", "Corn", ItemKind::Crop, 2),
                item("soybean", "Soybean", ItemKind::Crop, 3),
                item("carrot", "Carrot", ItemKind::Crop, 5),
                item("potato", "Potato", ItemKind::Crop, 6),
                item("tomato", "Tomato", ItemKind::Crop, 7),
                item("chicken_feed", "Chicken Feed", ItemKind::Feed, 3),
                item("cow_feed", "Cow Feed", ItemKind::Feed, 5),
                item("egg", "Egg", ItemKind::AnimalProduct, 3),
                item("milk", "Milk", ItemKind::AnimalProduct, 5),
                item("bread", "Bread", ItemKind::Product, 2),
                item("corn_bread", "Corn Bread", ItemKind::Product, 4),
                item("potato_bread", "Potato Bread", ItemKind::Product, 6),
                item("carrot_cake", "Carrot Cake", ItemKind::Product, 6),
                item("tomato_tart", "Tomato Tart", ItemKind::Product, 7),
            ],
            crops: vec![
                crop("wheat", 120, 2, 1, 1),
                crop("corn", 300, 2, 2, 2),
                crop("soybean", 1200, 2, 3, 3),
                crop("carrot", 600, 2, 3, 5),
                crop("potato", 1500, 2, 4, 6),
                crop("tomato", 1800, 2, 5, 7),
            ],
            recipes: vec![
                recipe(
                    "bread",
                    "Bread",
                    MachineKind::Bakery,
                    vec![ItemStack::new("wheat", 3)],
                    vec![ItemStack::new("bread", 1)],
                    300,
                    4,
                    2,
                ),
                recipe(
                    "corn_bread",
                    "Corn Bread",
                    MachineKind::Bakery,
                    vec![ItemStack::new("corn", 2), ItemStack::new("egg", 1)],
                    vec![ItemStack::new("corn_bread", 1)],
                    1800,
                    8,
                    4,
                ),
                recipe(
                    "potato_bread",
                    "Potato Bread",
                    MachineKind::Bakery,
                    vec![ItemStack::new("wheat", 2), ItemStack::new("potato", 2)],
                    vec![ItemStack::new("potato_bread", 1)],
                    2100,
                    9,
                    6,
                ),
                recipe(
                    "carrot_cake",
                    "Carrot Cake",
                    MachineKind::Bakery,
                    vec![
                        ItemStack::new("wheat", 2),
                        ItemStack::new("carrot", 2),
                        ItemStack::new("milk", 1),
                    ],
                    vec![ItemStack::new("carrot_cake", 1)],
                    2400,
                    10,
                    6,
                ),
                recipe(
                    "tomato_tart",
                    "Tomato Tart",
                    MachineKind::Bakery,
                    vec![
                        ItemStack::new("wheat", 2),
                        ItemStack::new("tomato", 2),
                        ItemStack::new("egg", 1),
                    ],
                    vec![ItemStack::new("tomato_tart", 1)],
                    2700,
                    12,
                    7,
                ),
                recipe(
                    "chicken_feed",
                    "Chicken Feed",
                    MachineKind::FeedMill,
                    vec![ItemStack::new("wheat", 2), ItemStack::new("corn", 1)],
                    vec![ItemStack::new("chicken_feed", 3)],
                    300,
                    2,
                    3,
                ),
                recipe(
                    "cow_feed",
                    "Cow Feed",
                    MachineKind::FeedMill,
                    vec![ItemStack::new("soybean", 2), ItemStack::new("corn", 1)],
                    vec![ItemStack::new("cow_feed", 3)],
                    600,
                    3,
                    5,
                ),
            ],
            machines: vec![
                MachineDef {
                    kind: MachineKind::Bakery,
                    name: "Bakery".to_owned(),
                    build_cost: 40,
                    unlock_level: 2,
                    queue_limit: 2,
                },
                MachineDef {
                    kind: MachineKind::FeedMill,
                    name: "Feed Mill".to_owned(),
                    build_cost: 35,
                    unlock_level: 3,
                    queue_limit: 2,
                },
            ],
            shelters: vec![
                ShelterDef {
                    kind: ShelterKind::ChickenCoop,
                    name: "Chicken Coop".to_owned(),
                    animal_name: "Chicken".to_owned(),
                    build_cost: 30,
                    unlock_level: 3,
                    slots: 3,
                    feed_item_id: "chicken_feed".to_owned(),
                    product_item_id: "egg".to_owned(),
                    reference_seconds: 1200,
                    xp: 3,
                },
                ShelterDef {
                    kind: ShelterKind::CowPasture,
                    name: "Cow Pasture".to_owned(),
                    animal_name: "Cow".to_owned(),
                    build_cost: 50,
                    unlock_level: 5,
                    slots: 2,
                    feed_item_id: "cow_feed".to_owned(),
                    product_item_id: "milk".to_owned(),
                    reference_seconds: 3600,
                    xp: 5,
                },
            ],
            market_items: vec![
                market_item("wheat", Some(4), Some(2), 1),
                market_item("corn", Some(8), Some(4), 2),
                market_item("soybean", Some(14), Some(7), 3),
                market_item("carrot", Some(18), Some(9), 5),
                market_item("potato", Some(24), Some(12), 6),
                market_item("tomato", Some(28), Some(14), 7),
                market_item("chicken_feed", Some(12), None, 3),
                market_item("cow_feed", Some(18), None, 5),
                market_item("egg", None, Some(10), 3),
                market_item("milk", None, Some(16), 5),
                market_item("bread", None, Some(18), 2),
                market_item("corn_bread", None, Some(28), 4),
                market_item("potato_bread", None, Some(34), 6),
                market_item("carrot_cake", None, Some(42), 6),
                market_item("tomato_tart", None, Some(46), 7),
            ],
            storage_upgrades: vec![
                storage_upgrade(StorageKind::Silo, 1, 2, 60, 60),
                storage_upgrade(StorageKind::Silo, 2, 4, 120, 85),
                storage_upgrade(StorageKind::Silo, 3, 6, 220, 115),
                storage_upgrade(StorageKind::Barn, 1, 2, 50, 45),
                storage_upgrade(StorageKind::Barn, 2, 4, 100, 65),
                storage_upgrade(StorageKind::Barn, 3, 6, 180, 90),
            ],
            level_xp: vec![0, 0, 4, 14, 30, 55, 90, 140],
        }
    }

    pub fn item(&self, id: &str) -> Option<&ItemDef> {
        self.items.iter().find(|item| item.id == id)
    }

    pub fn crop(&self, id: &str) -> Option<&CropDef> {
        self.crops.iter().find(|crop| crop.item_id == id)
    }

    pub fn recipe(&self, id: &str) -> Option<&RecipeDef> {
        self.recipes.iter().find(|recipe| recipe.id == id)
    }

    pub fn machine(&self, kind: &MachineKind) -> Option<&MachineDef> {
        self.machines.iter().find(|machine| &machine.kind == kind)
    }

    pub fn shelter(&self, kind: &ShelterKind) -> Option<&ShelterDef> {
        self.shelters.iter().find(|shelter| &shelter.kind == kind)
    }

    pub fn market_item(&self, item_id: &str) -> Option<&MarketItemDef> {
        self.market_items
            .iter()
            .find(|market_item| market_item.item_id == item_id)
    }

    pub fn storage_upgrade(
        &self,
        storage_kind: StorageKind,
        tier: u32,
    ) -> Option<&StorageUpgradeDef> {
        self.storage_upgrades
            .iter()
            .find(|upgrade| upgrade.storage_kind == storage_kind && upgrade.tier == tier)
    }

    pub fn item_kind(&self, item_id: &str) -> Option<&ItemKind> {
        self.item(item_id).map(|item| &item.kind)
    }

    pub fn level_for_xp(&self, xp: u32) -> u32 {
        self.level_xp
            .iter()
            .enumerate()
            .filter(|(_, threshold)| xp >= **threshold)
            .map(|(level, _)| level as u32)
            .max()
            .unwrap_or(1)
            .max(1)
    }
}

pub fn scaled_duration_ms(reference_seconds: u32, time_scale: u32) -> i64 {
    let scale = time_scale.max(1) as i64;
    (reference_seconds as i64 * 1000 / scale).max(1)
}

fn item(id: &str, name: &str, kind: ItemKind, unlock_level: u32) -> ItemDef {
    ItemDef {
        id: id.to_owned(),
        name: name.to_owned(),
        kind,
        unlock_level,
    }
}

fn crop(
    item_id: &str,
    reference_seconds: u32,
    harvest_quantity: u32,
    xp: u32,
    unlock_level: u32,
) -> CropDef {
    CropDef {
        item_id: item_id.to_owned(),
        reference_seconds,
        harvest_quantity,
        xp,
        unlock_level,
    }
}

#[allow(clippy::too_many_arguments)]
fn recipe(
    id: &str,
    name: &str,
    machine_kind: MachineKind,
    inputs: Vec<ItemStack>,
    outputs: Vec<ItemStack>,
    reference_seconds: u32,
    xp: u32,
    unlock_level: u32,
) -> RecipeDef {
    RecipeDef {
        id: id.to_owned(),
        name: name.to_owned(),
        machine_kind,
        inputs,
        outputs,
        reference_seconds,
        xp,
        unlock_level,
    }
}

fn market_item(
    item_id: &str,
    buy_price: Option<u32>,
    sell_price: Option<u32>,
    unlock_level: u32,
) -> MarketItemDef {
    MarketItemDef {
        item_id: item_id.to_owned(),
        buy_price,
        sell_price,
        unlock_level,
    }
}

fn storage_upgrade(
    storage_kind: StorageKind,
    tier: u32,
    unlock_level: u32,
    cost_coins: u32,
    capacity: u32,
) -> StorageUpgradeDef {
    StorageUpgradeDef {
        storage_kind,
        tier,
        unlock_level,
        cost_coins,
        capacity,
    }
}
