# structure.yaml スキーマ

構成図の構造だけを持つファイル。座標・色・線種は持たない。

```yaml
version: 1

metadata:
  view: orders-api          # 必須。ビュー名。出力ファイル名にもなる
  description: 注文 API の構成
  repos:                    # このビューが依存するリポジトリ/パス。更新時の対象特定に使う
    - github.com/example/orders

containers:                 # 枠 (AWS Cloud / Region / VPC / サブネット ...)
  - id: cloud               # 必須。図の中で一意
    kind: aws_cloud         # 必須。下の一覧から選ぶ
    name: AWS Cloud         # 省略時は kind の既定名
    parent: null            # 親コンテナの id。省略で最上位
    description: ...        # 図では tooltip になる
    band: 2                 # 任意。縦の帯 (0 起点) を固定したいときだけ使う

nodes:                      # リソース
  - id: api_fn              # 必須。図の中で一意
    type: AWS::Lambda::Function   # 必須 (style を直接書く場合は省略可)
    name: orders-api-handler      # 図に出る文字列
    container: region             # 所属する containers の id。省略で AWS の外側
    description: 注文の受付        # 図では tooltip になる
    source: main.tf:aws_lambda_function.orders_api  # 出所。追跡用
    style: "..."            # 任意。search_shapes の結果を貼るときだけ使う
    column: 3               # 任意。列を固定したいときだけ使う (通常は自動)

edges:                      # 関係
  - from: api_fn            # 必須。node か container の id
    to: orders_table        # 必須
    trigger: write          # 線の意味。色と線種が決まる
    label: 注文を保存        # 省略時は trigger の既定ラベル
    rank: false             # 任意。true 以外を指定すると列の計算から除外する
```

## containers の kind

| kind | 用途 |
|---|---|
| `aws_cloud` | AWS Cloud 全体の枠 |
| `account` | AWS アカウント |
| `region` | リージョン |
| `vpc` | VPC |
| `availability_zone` | AZ |
| `subnet` | サブネット (public/private を区別しない場合) |
| `public_subnet` | パブリックサブネット (緑) |
| `private_subnet` | プライベートサブネット (青) |
| `security_group` | セキュリティグループ (赤) |
| `auto_scaling_group` | Auto Scaling グループ |
| `ec2_instance_contents` | EC2 インスタンスの内側 |
| `step_functions_workflow` | Step Functions のワークフロー |
| `corporate_data_center` | 社内データセンター |
| `on_premise` | オンプレミス |
| `generic` | アイコンなしの論理的なくくり |

## edges の trigger

既定の語彙。`layout.yaml` の `triggers` で追加・上書きできる。

| trigger | 既定ラベル | 線 |
|---|---|---|
| `api_call` | API 呼び出し | 濃紺・実線 |
| `invoke` | 同期呼び出し | 濃紺・実線 |
| `send` | 送信 | 濃紺・実線 |
| `read` | 参照 | 灰・破線 |
| `write` | 書き込み | 灰・実線 |
| `schedule` | 定期実行 | 赤・破線 |
| `s3_event` | S3 イベント | 緑・破線 |
| `webhook_event` | Webhook | 緑・破線 |
| `stream` | ストリーム | 紫・実線 |
| `poll` | ポーリング | 紫・破線 |
| `queue` | キュー経由 | 桃・実線 |
| `notify` | 通知 | 桃・破線 |

## Terraform リソース → type の対応

`type` は CloudFormation のリソース型で書く。Terraform から起こすときの対応表。

| Terraform | type |
|---|---|
| `aws_lambda_function` | `AWS::Lambda::Function` |
| `aws_instance` | `AWS::EC2::Instance` |
| `aws_ecs_cluster` | `AWS::ECS::Cluster` |
| `aws_ecs_service` | `AWS::ECS::Service` |
| `aws_ecs_task_definition` | `AWS::ECS::TaskDefinition` |
| `aws_ecr_repository` | `AWS::ECR::Repository` |
| `aws_eks_cluster` | `AWS::EKS::Cluster` |
| `aws_batch_job_queue` | `AWS::Batch::JobQueue` |
| `aws_autoscaling_group` | `AWS::AutoScaling::AutoScalingGroup` |
| `aws_elastic_beanstalk_application` | `AWS::ElasticBeanstalk::Application` |
| `aws_apprunner_service` | `AWS::AppRunner::Service` |
| `aws_s3_bucket` | `AWS::S3::Bucket` |
| `aws_efs_file_system` | `AWS::EFS::FileSystem` |
| `aws_backup_vault` | `AWS::Backup::BackupVault` |
| `aws_db_instance` | `AWS::RDS::DBInstance` |
| `aws_rds_cluster` | `AWS::RDS::DBCluster` |
| `aws_dynamodb_table` | `AWS::DynamoDB::Table` |
| `aws_elasticache_cluster` | `AWS::ElastiCache::CacheCluster` |
| `aws_elasticache_replication_group` | `AWS::ElastiCache::ReplicationGroup` |
| `aws_redshift_cluster` | `AWS::Redshift::Cluster` |
| `aws_vpc` | `AWS::EC2::VPC` (通常は `containers` の `vpc` を使う) |
| `aws_nat_gateway` | `AWS::EC2::NatGateway` |
| `aws_internet_gateway` | `AWS::EC2::InternetGateway` |
| `aws_ec2_transit_gateway` | `AWS::EC2::TransitGateway` |
| `aws_vpc_endpoint` | `AWS::EC2::VPCEndpoint` |
| `aws_lb` / `aws_alb` | `AWS::ElasticLoadBalancingV2::LoadBalancer` |
| `aws_lb_target_group` | `AWS::ElasticLoadBalancingV2::TargetGroup` |
| `aws_route53_zone` | `AWS::Route53::HostedZone` |
| `aws_cloudfront_distribution` | `AWS::CloudFront::Distribution` |
| `aws_globalaccelerator_accelerator` | `AWS::GlobalAccelerator::Accelerator` |
| `aws_api_gateway_rest_api` | `AWS::ApiGateway::RestApi` |
| `aws_apigatewayv2_api` | `AWS::ApiGatewayV2::Api` |
| `aws_sqs_queue` | `AWS::SQS::Queue` |
| `aws_sns_topic` | `AWS::SNS::Topic` |
| `aws_cloudwatch_event_rule` | `AWS::Events::Rule` |
| `aws_cloudwatch_event_bus` | `AWS::Events::EventBus` |
| `aws_scheduler_schedule` | `AWS::Scheduler::Schedule` |
| `aws_sfn_state_machine` | `AWS::StepFunctions::StateMachine` |
| `aws_appsync_graphql_api` | `AWS::AppSync::GraphQLApi` |
| `aws_msk_cluster` | `AWS::MSK::Cluster` |
| `aws_kinesis_stream` | `AWS::Kinesis::Stream` |
| `aws_kinesis_firehose_delivery_stream` | `AWS::KinesisFirehose::DeliveryStream` |
| `aws_ses_domain_identity` | `AWS::SES::Identity` |
| `aws_athena_workgroup` | `AWS::Athena::WorkGroup` |
| `aws_glue_job` | `AWS::Glue::Job` |
| `aws_bedrockagent_agent` | `AWS::Bedrock::Agent` |
| `aws_sagemaker_endpoint` | `AWS::SageMaker::Endpoint` |
| `aws_iam_role` | `AWS::IAM::Role` |
| `aws_secretsmanager_secret` | `AWS::SecretsManager::Secret` |
| `aws_kms_key` | `AWS::KMS::Key` |
| `aws_wafv2_web_acl` | `AWS::WAFv2::WebACL` |
| `aws_cognito_user_pool` | `AWS::Cognito::UserPool` |
| `aws_acm_certificate` | `AWS::CertificateManager::Certificate` |
| `aws_cloudwatch_log_group` | `AWS::Logs::LogGroup` |
| `aws_cloudwatch_metric_alarm` | `AWS::CloudWatch::Alarm` |
| `aws_cloudwatch_dashboard` | `AWS::CloudWatch::Dashboard` |
| `aws_ssm_parameter` | `AWS::SSM::Parameter` |
| `aws_codebuild_project` | `AWS::CodeBuild::Project` |
| `aws_codepipeline` | `AWS::CodePipeline::Pipeline` |
| `aws_codedeploy_app` | `AWS::CodeDeploy::Application` |
| `aws_cloudtrail` | `AWS::CloudTrail::Trail` |

`aws_subnet` / `aws_availability_zone` / `aws_security_group` は `nodes` ではなく `containers` として表現する。

## containers の band

同じ親を持つコンテナは、占める列の範囲が重ならなければ同じ帯に横並びになる。
これで縦の間延びを防いでいるが、ときどき「列は重ならないが論理的には離れている」コンテナが
上の帯へ詰められ、そこへ向かう線が別のコンテナの高さを横切って誤読を招く。

その場合だけ `band` で帯を固定する。値は 0 起点で、上から順に数える。
指定しなかったコンテナは宣言順に自動で詰められるので、下げたいコンテナにだけ付ければよい。

## AWS の外側に置く登場人物

`container` を指定しないノードは AWS Cloud の外に置かれる。流れの起点にあるものは左端に縦中央寄せで配置される。

| type | 用途 |
|---|---|
| `External::User` / `External::Users` | 利用者 |
| `External::Client` | クライアント |
| `External::MobileClient` | モバイルアプリ |
| `External::Internet` | インターネット |
| `External::Office` | 社内 |
| `External::GenericApp` | 外部システム全般 |
| `External::GenericDatabase` | 外部データベース |

## layout.yaml (任意)

`structure.yaml` と同じディレクトリに置くと、描画設定を上書きできる。

```yaml
triggers:
  replicate:                # 語彙を足す
    label: レプリケーション
    stroke: "#8C4FFF"
    dashed: 1
  read:                     # 既定を上書きする
    label: 読み取り
    stroke: "#232F3E"
    dashed: 1

grid:
  colGap: 140               # 列の間隔を広げる
  rowGap: 90
```
