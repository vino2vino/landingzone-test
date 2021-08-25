import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as iam from '@aws-cdk/aws-iam';

import { SecureS3Bucket } from '@aws-compliant-constructs/secure-s3-bucket';
import { CodeCommitTrigger } from '@aws-cdk/aws-codepipeline-actions';

export interface AcceleratorPipelineProps {
  readonly sourceRepositoryName: string;
  readonly sourceBranchName: string;
}

export class AcceleratorPipeline extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: AcceleratorPipelineProps) {
    super(scope, id);

    const bucket = new SecureS3Bucket(this, 'SecureBucket', {
      s3BucketName: `aws-accelerator-pipeline-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      kmsAliasName: 'alias/accelerator/pipeline/s3',
      kmsDescription: 'AWS Accelerator Pipeline Bucket CMK',
    });

    /**
     * Configuration Repository
     */

    const configRepo = new codecommit.Repository(this, 'ConfigurationRepo', {
      repositoryName: 'aws-accelerator',
    });

    // TODO: Insert custom resource to initialize the CodeCommit repository with
    // default configuration files

    /**
     * Pipeline
     */
    const pipelineRole = new iam.Role(this, 'PipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'AWS-Accelerator',
      artifactBucket: bucket.getS3Bucket(),
      role: pipelineRole,
    });

    const acceleratorRepoArtifact = new codepipeline.Artifact('Source');
    const configRepoArtifact = new codepipeline.Artifact('Config');

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeCommitSourceAction({
          actionName: 'Source',
          repository: codecommit.Repository.fromRepositoryName(this, 'SourceRepo', props.sourceRepositoryName),
          branch: props.sourceBranchName,
          output: acceleratorRepoArtifact,
          trigger: CodeCommitTrigger.NONE,
        }),
        new codepipeline_actions.CodeCommitSourceAction({
          actionName: 'Configuration',
          repository: configRepo,
          branch: 'main',
          output: configRepoArtifact,
          trigger: CodeCommitTrigger.NONE,
        }),
      ],
    });

    /**
     * Build Stage
     */
    const buildRole = new iam.Role(this, 'BuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: 'AWS-Accelerator-BuildProject',
      role: buildRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 14,
            },
          },
          build: {
            commands: [
              'cd source',
              'yarn add aws-cdk@1.102.0 -W',
              'yarn add lerna@^4.0.0 -W',
              'yarn lerna bootstrap',
              'yarn build',
            ],
          },
        },
        artifacts: {
          files: ['*'],
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Allow access to the Docker daemon
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          ACCELERATOR_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: 'aws-accelerator',
          },
        },
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    const buildOutput = new codepipeline.Artifact('Build');

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build',
          project: buildProject,
          input: acceleratorRepoArtifact,
          outputs: [buildOutput],
          role: pipelineRole,
        }),
      ],
    });

    /**
     * Deploy Stage
     */
    const deployRole = new iam.Role(this, 'DeployRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    const deployProject = new codebuild.PipelineProject(this, 'DeployProject', {
      projectName: 'AWS-Accelerator-DeployProject',
      role: deployRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 14,
            },
          },
          build: {
            commands: ['pwd', 'ls -al', 'env'],
          },
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Allow access to the Docker daemon
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          ACCELERATOR_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: 'aws-accelerator',
          },
        },
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Validate',
          runOrder: 1,
          project: deployProject,
          input: buildOutput,
          extraInputs: [configRepoArtifact],
          role: pipelineRole,
          environmentVariables: {
            STAGE: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: 'validate',
            },
          },
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Accounts',
          runOrder: 2,
          project: deployProject,
          input: buildOutput,
          extraInputs: [configRepoArtifact],
          role: pipelineRole,
          environmentVariables: {
            STAGE: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: 'accounts',
            },
          },
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Dependencies',
          runOrder: 3,
          project: deployProject,
          input: buildOutput,
          extraInputs: [configRepoArtifact],
          role: pipelineRole,
          environmentVariables: {
            STAGE: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: 'dependencies',
            },
          },
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Security',
          runOrder: 4,
          project: deployProject,
          input: buildOutput,
          extraInputs: [configRepoArtifact],
          role: pipelineRole,
          environmentVariables: {
            STAGE: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: 'security',
            },
          },
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Operations',
          runOrder: 5,
          project: deployProject,
          input: buildOutput,
          extraInputs: [configRepoArtifact],
          role: pipelineRole,
          environmentVariables: {
            STAGE: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: 'operations',
            },
          },
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Networking',
          runOrder: 6,
          project: deployProject,
          input: buildOutput,
          extraInputs: [configRepoArtifact],
          role: pipelineRole,
          environmentVariables: {
            STAGE: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: 'networking',
            },
          },
        }),
      ],
    });
  }
}
