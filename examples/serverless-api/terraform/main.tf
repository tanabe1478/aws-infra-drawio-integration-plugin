# スキルの動作確認用のサンプル Terraform。
# 実運用向けの設定 (暗号化・ログ・タグなど) は意図的に省いている。

provider "aws" {
  region = "ap-northeast-1"
}

resource "aws_cloudfront_distribution" "web" {
  enabled = true

  origin {
    domain_name = aws_apigatewayv2_api.orders.api_endpoint
    origin_id    = "orders-api"
  }

  default_cache_behavior {
    target_origin_id       = "orders-api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_wafv2_web_acl" "edge" {
  name  = "orders-edge-acl"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "orders-edge-acl"
    sampled_requests_enabled   = true
  }
}

resource "aws_apigatewayv2_api" "orders" {
  name          = "orders-api"
  protocol_type = "HTTP"
}

resource "aws_lambda_function" "orders_api" {
  function_name = "orders-api-handler"
  role          = aws_iam_role.orders_api.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  filename      = "handler.zip"

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.orders.name
      QUEUE_URL  = aws_sqs_queue.fulfillment.url
    }
  }
}

resource "aws_iam_role" "orders_api" {
  name               = "orders-api-handler-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_dynamodb_table" "orders" {
  name         = "orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "order_id"

  attribute {
    name = "order_id"
    type = "S"
  }
}

resource "aws_sqs_queue" "fulfillment" {
  name = "order-fulfillment"
}

resource "aws_lambda_function" "fulfillment_worker" {
  function_name = "order-fulfillment-worker"
  role          = aws_iam_role.orders_api.arn
  handler       = "worker.handler"
  runtime       = "nodejs22.x"
  filename      = "worker.zip"
}

resource "aws_lambda_event_source_mapping" "fulfillment" {
  event_source_arn = aws_sqs_queue.fulfillment.arn
  function_name    = aws_lambda_function.fulfillment_worker.arn
  batch_size       = 10
}

resource "aws_s3_bucket" "receipts" {
  bucket = "orders-receipts"
}

resource "aws_sns_topic" "alerts" {
  name = "orders-alerts"
}

resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "orders-api-5xx"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_event_rule" "nightly_reconcile" {
  name                = "orders-nightly-reconcile"
  schedule_expression = "cron(0 18 * * ? *)"
}

resource "aws_cloudwatch_event_target" "nightly_reconcile" {
  rule = aws_cloudwatch_event_rule.nightly_reconcile.name
  arn  = aws_lambda_function.fulfillment_worker.arn
}
