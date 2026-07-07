export function colorForItem(itemId: string): string {
  switch (itemId) {
    case "wheat":
      return "#e2c85a";
    case "corn":
      return "#f0b744";
    case "soybean":
      return "#7bb86d";
    case "carrot":
      return "#e9873a";
    case "potato":
      return "#b8925a";
    case "tomato":
      return "#cf4747";
    case "bread":
      return "#c68a4a";
    case "corn_bread":
      return "#dcae52";
    case "potato_bread":
      return "#b88451";
    case "carrot_cake":
      return "#d77d52";
    case "tomato_tart":
      return "#c95b55";
    case "egg":
      return "#f4eee2";
    case "milk":
      return "#dbeefe";
    default:
      return "#9cc7a1";
  }
}
