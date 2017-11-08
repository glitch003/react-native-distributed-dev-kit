#!/bin/bash

mkdocs build

export AWS_ACCESS_KEY_ID="$SDKD_S3_DOCS_AWS_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$SDKD_S3_DOCS_AWS_SECRET_ACCESS_KEY"

cd site

s3-deploy './**' --region us-east-1 --bucket docs.sdkd.co
