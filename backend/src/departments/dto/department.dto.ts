import { IsNotEmpty, IsString, IsUUID } from "class-validator";

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateDesignationDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsUUID()
  departmentId: string;
}
