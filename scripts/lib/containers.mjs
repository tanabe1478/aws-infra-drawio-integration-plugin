// AWS アーキテクチャ図のコンテナ (グループ枠) 定義。
//
// style は draw.io の shape インデックスに実在する mxgraph.aws4.group* を使い、
// container=1 / pointerEvents=0 / collapsible=0 / recursiveResize=0 を付けて
// 「中に図形を入れられる枠」にしている。色は AWS 公式アイコンガイドラインの
// 2021 年以降の配色に合わせている。

const POINTS =
  "points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];";
const BASE =
  "outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;" +
  "container=1;pointerEvents=0;collapsible=0;recursiveResize=0;";

function group(grIcon, { stroke, font, fill = "none", dashed = 0, extra = "" }) {
  return (
    POINTS +
    BASE +
    `shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.${grIcon};` +
    extra +
    `strokeColor=${stroke};fillColor=${fill};verticalAlign=top;align=left;spacingLeft=30;` +
    `fontColor=${font};dashed=${dashed};`
  );
}

export const CONTAINER_KINDS = {
  aws_cloud: {
    style: group("group_aws_cloud", { stroke: "#232F3E", font: "#232F3E" }),
    defaultName: "AWS Cloud",
  },
  account: {
    style: group("group_account", { stroke: "#CD2264", font: "#CD2264" }),
    defaultName: "AWS Account",
  },
  region: {
    style: group("group_region", { stroke: "#00A4A6", font: "#147EBA", dashed: 1 }),
    defaultName: "Region",
  },
  vpc: {
    style: group("group_vpc2", { stroke: "#8C4FFF", font: "#8C4FFF" }),
    defaultName: "VPC",
  },
  availability_zone: {
    style: group("group_availability_zone", { stroke: "#00A4A6", font: "#147EBA", dashed: 1 }),
    defaultName: "Availability Zone",
  },
  subnet: {
    style: group("group_subnet", { stroke: "#00A4A6", font: "#147EBA" }),
    defaultName: "Subnet",
  },
  public_subnet: {
    style: group("group_security_group", {
      stroke: "#7AA116",
      font: "#248814",
      fill: "#F2F6E8",
      extra: "grStroke=0;",
    }),
    defaultName: "Public subnet",
  },
  private_subnet: {
    style: group("group_security_group", {
      stroke: "#00A4A6",
      font: "#147EBA",
      fill: "#E6F6F7",
      extra: "grStroke=0;",
    }),
    defaultName: "Private subnet",
  },
  security_group: {
    style: group("group_security_group", { stroke: "#DD3522", font: "#DD3522", extra: "grStroke=0;" }),
    defaultName: "Security group",
  },
  auto_scaling_group: {
    style:
      POINTS +
      BASE +
      "shape=mxgraph.aws4.groupCenter;grIcon=mxgraph.aws4.group_auto_scaling_group;grStroke=1;" +
      "strokeColor=#D86613;fillColor=none;verticalAlign=top;align=center;fontColor=#D86613;dashed=1;spacingTop=25;",
    defaultName: "Auto Scaling group",
  },
  ec2_instance_contents: {
    style: group("group_ec2_instance_contents", { stroke: "#D86613", font: "#D86613" }),
    defaultName: "EC2 instance contents",
  },
  step_functions_workflow: {
    style: group("group_aws_step_functions_workflow", { stroke: "#CD2264", font: "#CD2264" }),
    defaultName: "Step Functions workflow",
  },
  corporate_data_center: {
    style: group("group_corporate_data_center", { stroke: "#7D8998", font: "#5A6C86" }),
    defaultName: "Corporate data center",
  },
  on_premise: {
    style: group("group_on_premise", { stroke: "#7D8998", font: "#5A6C86" }),
    defaultName: "On-premises",
  },
  // アイコンなしの素の枠。論理的なくくり (システム境界など) に使う。
  generic: {
    style:
      POINTS +
      BASE +
      "rounded=0;strokeColor=#879196;fillColor=none;verticalAlign=top;align=left;spacingLeft=10;" +
      "fontColor=#879196;dashed=1;",
    defaultName: "Group",
  },
};

export const CONTAINER_KIND_NAMES = Object.keys(CONTAINER_KINDS);
