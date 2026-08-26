import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { TodoPriority, TodoStatus } from "@prisma/client";
import { PaginationDto } from "../../common/dto/pagination.dto";

export class CreateTodoDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string; // defaults to self for personal tasks

  @IsOptional()
  @IsString()
  project?: string;

  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  estimatedHours?: number;
}

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  estimatedHours?: number;
}

export class CompleteTodoDto {
  @IsNumber()
  actualHours: number;

  @IsOptional()
  @IsString()
  outputSummary?: string;
}

export class TodoQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}


export class ResolveTodoDto {
  @IsString()
  outcome: "COMPLETED" | "INCOMPLETE";

  @IsNumber()
  actualHours: number;

  @IsOptional()
  @IsString()
  outputSummary?: string;

  @IsOptional()
  @IsString()
  incompleteReason?: string;
}
