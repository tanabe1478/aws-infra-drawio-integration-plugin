#!/usr/bin/env node
// CloudFormation リソース型 -> draw.io の AWS アイコン style を機械生成する。
//
// アイコン名 (mxgraph.aws4.*) を人手で書き写すと必ず typo/幻覚が混ざるため、
// draw.io 公式の shape インデックスを検索して style を確定させ、
// scripts/shape-map.json に固定する。生成物はコミット対象。
//
//   node scripts/gen-shape-map.mjs            # 生成
//   node scripts/gen-shape-map.mjs --check    # 差分があれば失敗 (CI 用)

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  findAwsResourceShape,
  findShapeByIcon,
  loadShapeIndex,
  PLUGIN_ROOT,
} from "./lib/shape-index.mjs";

// key: CloudFormation リソース型 (Terraform リソースは structure-spec.md の対応表で寄せる)
// value: shape インデックスへの検索キーワード、または { icon } でアイコン名を直接固定
//        (キーワード検索が別バリアントを引いてしまう型はアイコン名で確定させる)
const QUERIES = {
  // --- Compute ---
  "AWS::Lambda::Function": "lambda function",
  "AWS::EC2::Instance": { icon: "ec2" },
  "AWS::ECS::Cluster": "elastic container service",
  "AWS::ECS::Service": { icon: "ecs_service" },
  "AWS::ECS::TaskDefinition": { icon: "ecs_task" },
  "AWS::ECR::Repository": "elastic container registry image",
  "AWS::EKS::Cluster": "elastic kubernetes service",
  "AWS::Batch::JobQueue": "batch",
  "AWS::AutoScaling::AutoScalingGroup": "ec2 auto scaling",
  "AWS::ElasticBeanstalk::Application": "elastic beanstalk",
  "AWS::AppRunner::Service": "app runner",

  // --- Storage ---
  "AWS::S3::Bucket": "simple storage service bucket",
  "AWS::EFS::FileSystem": "elastic file system",
  "AWS::Backup::BackupVault": "backup vault",

  // --- Database ---
  "AWS::RDS::DBInstance": "rds instance",
  "AWS::RDS::DBCluster": "aurora",
  "AWS::DynamoDB::Table": { icon: "dynamodb" },
  "AWS::ElastiCache::CacheCluster": "elasticache",
  "AWS::ElastiCache::ReplicationGroup": "elasticache redis",
  "AWS::Redshift::Cluster": "redshift",

  // --- Network / Delivery ---
  "AWS::EC2::VPC": "virtual private cloud vpc",
  "AWS::EC2::NatGateway": "nat gateway",
  "AWS::EC2::InternetGateway": "internet gateway",
  "AWS::EC2::TransitGateway": "transit gateway",
  "AWS::EC2::VPCEndpoint": "endpoints",
  "AWS::ElasticLoadBalancingV2::LoadBalancer": "application load balancer",
  "AWS::ElasticLoadBalancingV2::TargetGroup": "elastic load balancing",
  "AWS::Route53::HostedZone": "route 53 hosted zone",
  "AWS::CloudFront::Distribution": "cloudfront",
  "AWS::GlobalAccelerator::Accelerator": "global accelerator",
  "AWS::ApiGateway::RestApi": "api gateway endpoint",
  "AWS::ApiGatewayV2::Api": "api gateway endpoint",

  // --- Application integration ---
  "AWS::SQS::Queue": "simple queue service queue",
  "AWS::SNS::Topic": "simple notification service topic",
  "AWS::Events::Rule": { icon: "rule" },
  "AWS::Events::EventBus": "eventbridge event bus",
  "AWS::Scheduler::Schedule": "eventbridge scheduler",
  "AWS::StepFunctions::StateMachine": "step functions",
  "AWS::AppSync::GraphQLApi": "appsync",
  "AWS::MSK::Cluster": "managed streaming kafka",
  "AWS::Kinesis::Stream": "kinesis data streams",
  "AWS::KinesisFirehose::DeliveryStream": "kinesis data firehose",
  "AWS::SES::Identity": "simple email service",

  // --- Analytics / AI ---
  "AWS::Athena::WorkGroup": "athena",
  "AWS::Glue::Job": "glue",
  "AWS::Bedrock::Agent": "bedrock",
  "AWS::SageMaker::Endpoint": { icon: "sagemaker" },

  // --- Security / Identity ---
  "AWS::IAM::Role": "identity access management role",
  "AWS::SecretsManager::Secret": "secrets manager",
  "AWS::KMS::Key": "key management service",
  "AWS::WAFv2::WebACL": "waf",
  "AWS::Cognito::UserPool": "cognito",
  "AWS::CertificateManager::Certificate": { icon: "certificate_manager" },

  // --- Management / Observability / CI ---
  "AWS::Logs::LogGroup": "cloudwatch logs",
  "AWS::CloudWatch::Alarm": "cloudwatch alarm",
  "AWS::CloudWatch::Dashboard": { icon: "cloudwatch_2" },
  "AWS::SSM::Parameter": "systems manager parameter store",
  "AWS::CodeBuild::Project": "codebuild",
  "AWS::CodePipeline::Pipeline": "codepipeline",
  "AWS::CodeDeploy::Application": "codedeploy",
  "AWS::CloudTrail::Trail": "cloudtrail",

  // --- 疑似型: AWS の外側に置く登場人物 ---
  "External::User": "general resources user",
  "External::Users": "general resources users",
  "External::Client": "general resources client",
  "External::MobileClient": "general resources mobile client",
  "External::Internet": "general resources internet",
  "External::Office": "general resources office building",
  "External::GenericApp": "general resources generic application",
  "External::GenericDatabase": "general resources generic database",
};

const index = loadShapeIndex();
const out = {};
const unresolved = [];

for (const [type, spec] of Object.entries(QUERIES)) {
  const hit =
    typeof spec === "string"
      ? findAwsResourceShape(index, spec)
      : findShapeByIcon(index, spec.icon);
  const source = typeof spec === "string" ? spec : `icon:${spec.icon}`;

  if (!hit) {
    unresolved.push({ type, source });
    continue;
  }

  out[type] = { style: hit.style, w: hit.w, h: hit.h, shapeTitle: hit.title, source };
}

const target = join(PLUGIN_ROOT, "scripts", "shape-map.json");
const json = JSON.stringify(out, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = readFileSync(target, "utf-8");

  if (current !== json) {
    console.error("shape-map.json が生成結果と一致しません。`npm run gen:shape-map` を実行してください。");
    process.exit(1);
  }

  console.log(`OK: ${Object.keys(out).length} 型が最新です。`);
} else {
  writeFileSync(target, json);
  console.log(`書き出し: ${target} (${Object.keys(out).length} 型)`);
}

if (unresolved.length > 0) {
  console.error("\n未解決 (クエリを見直してください):");
  for (const u of unresolved) console.error(`  ${u.type}  <- "${u.source}"`);
  process.exit(1);
}

// 解決結果を目視確認できるよう、型 -> 採用された shape のタイトルを出す。
for (const [type, v] of Object.entries(out)) {
  console.log(`  ${type.padEnd(46)} -> ${v.shapeTitle}`);
}
